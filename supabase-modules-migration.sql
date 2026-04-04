-- ============================================
-- Module-Based Pricing Migration
-- Supabase Dashboard SQL Editor'de çalıştırın
-- ============================================

-- 1. subscription_modules tablosu
CREATE TABLE IF NOT EXISTS public.subscription_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    module_id TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, module_id)
);

-- 2. RLS
ALTER TABLE public.subscription_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own modules" ON public.subscription_modules
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on modules" ON public.subscription_modules
    FOR ALL USING (true);

-- 3. handle_new_user trigger güncelle — trial: tüm modüller 14 gün
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, email, status, is_trial, trial_ends_at, started_at, expires_at)
    VALUES (
        NEW.id,
        NEW.email,
        'active',
        true,
        NOW() + INTERVAL '14 days',
        NOW(),
        NOW() + INTERVAL '14 days'
    );

    INSERT INTO public.credit_balances (user_id, credits_reset_at)
    VALUES (NEW.id, NOW() + INTERVAL '30 days');

    -- Trial: tüm modüller aktif
    INSERT INTO public.subscription_modules (user_id, module_id, status, expires_at) VALUES
    (NEW.id, 'excel_assistant', 'active', NOW() + INTERVAL '14 days'),
    (NEW.id, 'e_tebligat', 'active', NOW() + INTERVAL '14 days');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Mevcut aktif kullanıcılara tüm modülleri ekle (geriye dönük)
INSERT INTO public.subscription_modules (user_id, module_id, status, expires_at)
SELECT s.user_id, 'excel_assistant', 'active', s.expires_at
FROM public.subscriptions s
WHERE s.status = 'active'
ON CONFLICT (user_id, module_id) DO NOTHING;

INSERT INTO public.subscription_modules (user_id, module_id, status, expires_at)
SELECT s.user_id, 'e_tebligat', 'active', s.expires_at
FROM public.subscriptions s
WHERE s.status = 'active'
ON CONFLICT (user_id, module_id) DO NOTHING;
