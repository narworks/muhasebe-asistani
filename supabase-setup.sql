-- ============================================
-- MUHASEBE ASISTANI - SUPABASE SQL SCHEMA
-- ============================================
-- Bu dosyayı Supabase SQL Editor'de çalıştırın
-- ============================================

-- 1. SUBSCRIPTIONS TABLE
-- Kullanıcı abonelik durumlarını takip eder
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,

    -- Subscription details
    plan TEXT DEFAULT 'pro' CHECK (plan IN ('pro')),
    status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'cancelled', 'expired')),

    -- Billing
    iyzico_subscription_reference_code TEXT UNIQUE,
    iyzico_customer_reference_code TEXT,

    -- Dates
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Metadata
    device_id TEXT,
    app_version TEXT,
    last_check_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes
    UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_iyzico_ref ON public.subscriptions(iyzico_subscription_reference_code);

-- 2. USAGE_LOGS TABLE (Optional - AI kullanım takibi için)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,

    -- Usage details
    operation_type TEXT NOT NULL CHECK (operation_type IN ('statement_convert', 'e_tebligat_scan')),
    tokens_used INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,

    -- Metadata
    device_id TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.usage_logs(created_at DESC);

-- 3. ROW LEVEL SECURITY (RLS)
-- Kullanıcılar sadece kendi kayıtlarını görebilir

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Subscriptions RLS Policies
CREATE POLICY "Users can view their own subscription"
    ON public.subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription"
    ON public.subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role can do everything on subscriptions"
    ON public.subscriptions
    FOR ALL
    USING (auth.role() = 'service_role');

-- Usage Logs RLS Policies
CREATE POLICY "Users can view their own usage logs"
    ON public.usage_logs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can do everything on usage_logs"
    ON public.usage_logs
    FOR ALL
    USING (auth.role() = 'service_role');

-- 4. FUNCTIONS & TRIGGERS

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to subscriptions
CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create subscription on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.subscriptions (user_id, email, status)
    VALUES (NEW.id, NEW.email, 'inactive');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 5. SAMPLE DATA (Development/Testing only - remove for production)
-- INSERT INTO public.subscriptions (user_id, email, plan, status, started_at, expires_at)
-- VALUES
--     ((SELECT id FROM auth.users LIMIT 1), 'test@example.com', 'pro', 'active', NOW(), NOW() + INTERVAL '30 days');

-- ============================================
-- SETUP CHECKLIST
-- ============================================
-- 1. Supabase Dashboard → SQL Editor'da bu dosyayı çalıştırın
-- 2. Authentication → Providers → Email → Enable edin
-- 3. Settings → API → URL ve ANON_KEY'i kopyalayın
-- 4. .env dosyasına ekleyin:
--    SUPABASE_URL=https://your-project.supabase.co
--    SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
--    SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
-- ============================================
