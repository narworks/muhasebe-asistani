/**
 * Anonymous scan telemetry sender.
 * Sends aggregate scan metrics to Supabase scan_telemetry table.
 *
 * PII-safe: no firm names, no TC/VKN, no GIB credentials, no file paths.
 * Only: app version, OS, counts, durations, error types.
 *
 * Can be disabled via settings.json `telemetry: false` (hidden, no UI toggle).
 */

const crypto = require('crypto');
const os = require('os');
const { app } = require('electron');
const logger = require('./logger');
const settings = require('./settings');
const supabaseModule = require('./supabase');

/**
 * Hash user ID to anonymous but stable identifier (SHA256 truncated).
 * Allows us to correlate scans from same user without knowing who they are.
 */
function hashUserId(userId) {
    if (!userId) return 'anonymous';
    return crypto
        .createHash('sha256')
        .update(String(userId) + 'muhasebeasistani-telemetry-salt')
        .digest('hex')
        .substring(0, 16);
}

/**
 * Check if telemetry is enabled in user settings.
 * Default: true. Can be disabled via settings.json `telemetry: false`.
 */
function isEnabled() {
    try {
        const s = settings.readSettings();
        if (s && s.telemetry === false) return false;
    } catch {
        /* if settings unreadable, default to enabled */
    }
    return true;
}

/**
 * Send scan telemetry to Supabase.
 * Fire-and-forget: errors are logged but do not throw.
 *
 * @param {Object} params
 * @param {string} params.userId - Supabase user id (will be hashed)
 * @param {string} params.scanType - 'full' | 'preview' | 'selective'
 * @param {boolean} params.isFirstScan
 * @param {number} params.totalDurationSec
 * @param {Object} params.aggregated - output of tracer.aggregateTraces()
 * @param {Object} params.scanConfig - scan config snapshot (delays, limits)
 * @param {number} params.rateLimitWaitMs
 * @param {Object} params.captchaStats - captchaSolver.getStats() output
 */
async function sendScanTelemetry(params) {
    if (!isEnabled()) {
        logger.debug('[Telemetry] Disabled via settings, skipping');
        return;
    }

    try {
        const supabase = supabaseModule.getClient();
        if (!supabase) {
            logger.debug('[Telemetry] Supabase client not ready, skipping');
            return;
        }

        const payload = {
            user_id_hash: hashUserId(params.userId),
            app_version: app.getVersion(),
            os_platform: `${os.platform()}-${os.arch()}`,
            electron_version: process.versions.electron || null,
            node_version: process.versions.node || null,
            scan_type: params.scanType,
            is_first_scan: Boolean(params.isFirstScan),
            client_count: params.aggregated.client_count || 0,
            success_count: params.aggregated.success_count || 0,
            error_count: params.aggregated.error_count || 0,
            total_duration_sec: Math.round(params.totalDurationSec || 0),
            login_http_ms: params.aggregated.login_http_ms || 0,
            login_puppeteer_ms: params.aggregated.login_puppeteer_ms || 0,
            captcha_tesseract_ms: params.aggregated.captcha_tesseract_ms || 0,
            captcha_gemini_ms: params.aggregated.captcha_gemini_ms || 0,
            api_list_ms: params.aggregated.api_list_ms || 0,
            download_ms: params.aggregated.download_ms || 0,
            rate_limit_wait_ms: Math.round(params.rateLimitWaitMs || 0),
            captcha_tesseract_success: params.captchaStats?.tesseract_success || 0,
            captcha_tesseract_fail: params.captchaStats?.tesseract_fail || 0,
            captcha_gemini_fallback:
                (params.captchaStats?.gemini_success || 0) +
                (params.captchaStats?.gemini_fail || 0),
            captcha_gemini_success: params.captchaStats?.gemini_success || 0,
            puppeteer_fallback_count: params.aggregated.puppeteer_fallback_count || 0,
            docs_found: params.aggregated.docs_found || 0,
            docs_downloaded: params.aggregated.docs_downloaded || 0,
            docs_skipped_existing: params.aggregated.docs_skipped_existing || 0,
            docs_skipped_filter: params.aggregated.docs_skipped_filter || 0,
            error_types: params.aggregated.error_types || {},
            scan_config: sanitizeScanConfig(params.scanConfig || {}),
        };

        const { error } = await supabase.from('scan_telemetry').insert(payload);

        if (error) {
            logger.debug(`[Telemetry] Insert failed: ${error.message}`);
            return;
        }

        logger.debug(
            `[Telemetry] Sent: ${payload.scan_type}, ${payload.client_count} clients, ${payload.total_duration_sec}s`
        );
    } catch (err) {
        logger.debug(`[Telemetry] Send error (ignored): ${err.message}`);
    }
}

/**
 * Sanitize scan config — keep only numeric/boolean values, strip anything else.
 * Defense in depth against accidental PII leakage.
 */
function sanitizeScanConfig(config) {
    const allowed = [
        'delayMin',
        'delayMax',
        'batchSize',
        'batchPauseMin',
        'batchPauseMax',
        'maxCaptchaRetries',
    ];
    const clean = {};
    for (const key of allowed) {
        const v = config[key];
        if (typeof v === 'number' || typeof v === 'boolean') clean[key] = v;
    }
    return clean;
}

module.exports = { sendScanTelemetry, hashUserId, isEnabled };
