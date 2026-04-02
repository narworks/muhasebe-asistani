-- ============================================
-- 14-Day Free Trial Migration
-- Supabase Dashboard SQL Editor'de çalıştırın
-- ============================================

-- 1. Yeni trial alanlarını ekle
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2. handle_new_user trigger'ını güncelle
-- Yeni kayıt olan kullanıcılara 14 günlük aktif trial ver
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, email, status, is_trial, trial_ends_at, started_at, expires_at)
    VALUES (
        NEW.id,
        NEW.email,
        'active',                          -- Trial süresince aktif
        true,                              -- Trial flag
        NOW() + INTERVAL '14 days',        -- 14 gün sonra biter
        NOW(),                             -- Başlangıç tarihi
        NOW() + INTERVAL '14 days'         -- expires_at = trial bitiş
    );

    INSERT INTO public.credit_balances (user_id, credits_reset_at)
    VALUES (NEW.id, NOW() + INTERVAL '30 days');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger'ın bağlı olduğunu doğrula (zaten varsa skip)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
