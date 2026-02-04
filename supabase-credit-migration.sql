-- ============================================
-- MUHASEBE ASISTANI - KREDİ SİSTEMİ MIGRATION
-- ============================================
-- Bu dosyayı Supabase SQL Editor'de çalıştırın
-- Mevcut supabase-setup.sql'den SONRA uygulanır
-- ============================================

-- 1. CREDIT_BALANCES TABLE
-- Her kullanıcının aylık ve satın alınmış kredi bakiyesini tutar
CREATE TABLE IF NOT EXISTS public.credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    monthly_credits_limit INTEGER NOT NULL DEFAULT 5000,
    monthly_credits_used INTEGER NOT NULL DEFAULT 0,
    credits_reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    purchased_credits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_user_id ON public.credit_balances(user_id);

-- Apply updated_at trigger
CREATE TRIGGER set_credit_balances_updated_at
    BEFORE UPDATE ON public.credit_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. RLS for credit_balances
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit balance"
    ON public.credit_balances
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can do everything on credit_balances"
    ON public.credit_balances
    FOR ALL
    USING (auth.role() = 'service_role');

-- 3. Add credits_charged column to usage_logs
ALTER TABLE public.usage_logs
    ADD COLUMN IF NOT EXISTS credits_charged INTEGER DEFAULT 0;

-- 4. UPDATE handle_new_user TRIGGER
-- Artık yeni kullanıcı oluştuğunda credit_balances satırı da oluşturulur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, email, status)
    VALUES (NEW.id, NEW.email, 'inactive');

    INSERT INTO public.credit_balances (user_id, credits_reset_at)
    VALUES (NEW.id, NOW() + INTERVAL '30 days');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. get_credit_balance RPC
-- Kullanıcının kredi bakiyesini döndürür, reset zamanı geçmişse otomatik sıfırlar
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row public.credit_balances%ROWTYPE;
    v_monthly_remaining INTEGER;
BEGIN
    SELECT * INTO v_row
    FROM public.credit_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Kullanıcının kredi kaydı yoksa oluştur
        INSERT INTO public.credit_balances (user_id, credits_reset_at)
        VALUES (p_user_id, NOW() + INTERVAL '30 days')
        RETURNING * INTO v_row;
    END IF;

    -- Reset zamanı geçmişse aylık kredileri sıfırla
    IF v_row.credits_reset_at <= NOW() THEN
        UPDATE public.credit_balances
        SET monthly_credits_used = 0,
            credits_reset_at = NOW() + INTERVAL '30 days'
        WHERE user_id = p_user_id
        RETURNING * INTO v_row;
    END IF;

    v_monthly_remaining := GREATEST(0, v_row.monthly_credits_limit - v_row.monthly_credits_used);

    RETURN json_build_object(
        'monthly_remaining', v_monthly_remaining,
        'monthly_limit', v_row.monthly_credits_limit,
        'monthly_used', v_row.monthly_credits_used,
        'purchased_remaining', v_row.purchased_credits,
        'total_remaining', v_monthly_remaining + v_row.purchased_credits,
        'reset_at', v_row.credits_reset_at
    );
END;
$$;

-- 6. deduct_credits RPC (Atomik)
-- FOR UPDATE row lock ile race condition koruması
-- Önce aylık krediden düşer, yetersizse purchased'dan düşer
CREATE OR REPLACE FUNCTION public.deduct_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_operation_type TEXT,
    p_device_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row public.credit_balances%ROWTYPE;
    v_monthly_remaining INTEGER;
    v_monthly_deduct INTEGER;
    v_purchased_deduct INTEGER;
    v_remaining_to_deduct INTEGER;
BEGIN
    -- Row lock ile güvenli okuma
    SELECT * INTO v_row
    FROM public.credit_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'no_credit_record');
    END IF;

    -- Reset zamanı geçmişse aylık kredileri sıfırla
    IF v_row.credits_reset_at <= NOW() THEN
        UPDATE public.credit_balances
        SET monthly_credits_used = 0,
            credits_reset_at = NOW() + INTERVAL '30 days'
        WHERE user_id = p_user_id
        RETURNING * INTO v_row;
    END IF;

    v_monthly_remaining := GREATEST(0, v_row.monthly_credits_limit - v_row.monthly_credits_used);

    -- Toplam yeterli mi kontrol et
    IF (v_monthly_remaining + v_row.purchased_credits) < p_amount THEN
        RETURN json_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'total_remaining', v_monthly_remaining + v_row.purchased_credits,
            'required', p_amount
        );
    END IF;

    -- Önce aylık krediden düş
    v_monthly_deduct := LEAST(p_amount, v_monthly_remaining);
    v_remaining_to_deduct := p_amount - v_monthly_deduct;

    -- Kalan varsa purchased'dan düş
    v_purchased_deduct := v_remaining_to_deduct;

    UPDATE public.credit_balances
    SET monthly_credits_used = monthly_credits_used + v_monthly_deduct,
        purchased_credits = purchased_credits - v_purchased_deduct
    WHERE user_id = p_user_id;

    -- Usage log'a kaydet
    INSERT INTO public.usage_logs (user_id, operation_type, credits_charged, device_id, success)
    VALUES (p_user_id, p_operation_type, p_amount, p_device_id, true);

    -- Güncel bakiyeyi döndür
    v_monthly_remaining := v_monthly_remaining - v_monthly_deduct;

    RETURN json_build_object(
        'success', true,
        'credits_charged', p_amount,
        'monthly_remaining', v_monthly_remaining,
        'purchased_remaining', v_row.purchased_credits - v_purchased_deduct,
        'total_remaining', v_monthly_remaining + (v_row.purchased_credits - v_purchased_deduct)
    );
END;
$$;

-- 7. refund_credits RPC
-- İade her zaman purchased_credits'e eklenir (expire olmaz)
CREATE OR REPLACE FUNCTION public.refund_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_operation_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row public.credit_balances%ROWTYPE;
    v_monthly_remaining INTEGER;
BEGIN
    SELECT * INTO v_row
    FROM public.credit_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'no_credit_record');
    END IF;

    -- İade purchased_credits'e eklenir
    UPDATE public.credit_balances
    SET purchased_credits = purchased_credits + p_amount
    WHERE user_id = p_user_id
    RETURNING * INTO v_row;

    -- Usage log'a negatif kayıt
    INSERT INTO public.usage_logs (user_id, operation_type, credits_charged, success)
    VALUES (p_user_id, p_operation_type, -p_amount, true);

    v_monthly_remaining := GREATEST(0, v_row.monthly_credits_limit - v_row.monthly_credits_used);

    RETURN json_build_object(
        'success', true,
        'credits_refunded', p_amount,
        'monthly_remaining', v_monthly_remaining,
        'purchased_remaining', v_row.purchased_credits,
        'total_remaining', v_monthly_remaining + v_row.purchased_credits
    );
END;
$$;

-- 8. MIGRATION: Mevcut aktif kullanıcılara credit_balances satırı ekle
INSERT INTO public.credit_balances (user_id, credits_reset_at)
SELECT s.user_id, COALESCE(s.expires_at, NOW() + INTERVAL '30 days')
FROM public.subscriptions s
WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_balances cb WHERE cb.user_id = s.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- DOĞRULAMA
-- ============================================
-- Aşağıdaki sorguları çalıştırarak migration'ın başarılı olduğunu doğrulayın:
--
-- SELECT COUNT(*) FROM public.credit_balances;
-- SELECT * FROM public.get_credit_balance('KULLANICI_UUID');
-- SELECT * FROM public.deduct_credits('KULLANICI_UUID', 1, 'e_tebligat_scan');
-- SELECT * FROM public.refund_credits('KULLANICI_UUID', 5, 'statement_convert');
-- ============================================
