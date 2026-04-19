-- Scan telemetry table: anonymous scan performance metrics
-- No PII: no firm names, no TC/VKN, no GIB credentials
CREATE TABLE IF NOT EXISTS public.scan_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_hash TEXT NOT NULL, -- SHA256 truncated hash of auth user id (not reversible)
    app_version TEXT NOT NULL,
    os_platform TEXT, -- darwin-arm64, win32-x64, linux-x64
    electron_version TEXT,
    node_version TEXT,
    scan_type TEXT NOT NULL, -- 'full' | 'preview' | 'selective'
    is_first_scan BOOLEAN DEFAULT FALSE,
    client_count INTEGER NOT NULL,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    total_duration_sec INTEGER NOT NULL,
    -- Phase timings in milliseconds (aggregated across all clients in scan)
    login_http_ms BIGINT DEFAULT 0,
    login_puppeteer_ms BIGINT DEFAULT 0,
    captcha_tesseract_ms BIGINT DEFAULT 0,
    captcha_gemini_ms BIGINT DEFAULT 0,
    api_list_ms BIGINT DEFAULT 0,
    download_ms BIGINT DEFAULT 0,
    rate_limit_wait_ms BIGINT DEFAULT 0,
    -- CAPTCHA solver stats
    captcha_tesseract_success INTEGER DEFAULT 0,
    captcha_tesseract_fail INTEGER DEFAULT 0,
    captcha_gemini_fallback INTEGER DEFAULT 0,
    captcha_gemini_success INTEGER DEFAULT 0,
    -- Puppeteer fallback usage
    puppeteer_fallback_count INTEGER DEFAULT 0,
    -- Document stats
    docs_found INTEGER DEFAULT 0,
    docs_downloaded INTEGER DEFAULT 0,
    docs_skipped_existing INTEGER DEFAULT 0,
    docs_skipped_filter INTEGER DEFAULT 0,
    -- Error breakdown (JSON: {"captcha_failed": 2, "network_timeout": 1})
    error_types JSONB DEFAULT '{}'::jsonb,
    -- Scan config snapshot
    scan_config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_telemetry_created_at ON public.scan_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_telemetry_app_version ON public.scan_telemetry (app_version);
CREATE INDEX IF NOT EXISTS idx_scan_telemetry_scan_type ON public.scan_telemetry (scan_type);
CREATE INDEX IF NOT EXISTS idx_scan_telemetry_user_hash ON public.scan_telemetry (user_id_hash);

-- RLS: only service_role can insert (client-side cannot leak data)
ALTER TABLE public.scan_telemetry ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can only insert their own telemetry (via Edge Function)
CREATE POLICY "Users can insert own telemetry" ON public.scan_telemetry
    FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

-- Policy: service_role (admin) can read all
CREATE POLICY "Service role can read all telemetry" ON public.scan_telemetry
    FOR SELECT
    TO service_role
    USING (TRUE);

-- Users table: diagnostic_enabled flag for whitelist-based "Tanı Paketi" button
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS diagnostic_enabled BOOLEAN DEFAULT FALSE;
