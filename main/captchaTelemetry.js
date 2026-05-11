/**
 * CAPTCHA + GİB login per-attempt telemetry buffer.
 *
 * Mevcut main/telemetry.js scan-level aggregate gönderiyor (her scan sonu).
 * Bu modül per-attempt detayı gönderir — admin dashboard zaman serisi,
 * method breakdown ve failure sample listesi için gerekli.
 *
 * Akış:
 *   1. captchaSolver / gibAutomation her solve veya login attempt'ten sonra
 *      record* fonksiyonlarını çağırır (fire-and-forget, hata loglanır).
 *   2. Entry'ler in-memory buffer'a yazılır.
 *   3. 5 dakikada bir buffer landing API'ye POST edilir
 *      (/api/admin/telemetry/captcha-batch).
 *   4. POST fail olursa entry'ler buffer'da kalır, sonraki tick'te tekrar
 *      gönderilir. Buffer max boyutu aşılırsa en eskiler atılır (memory
 *      koruması).
 *   5. App quit'te flush() çağrılır.
 *
 * Auth: settings.getEncryptedValue('accessToken') — aiProxy ile aynı pattern.
 * Settings opt-out: telemetry === false → buffer doldurulmaz, network'e gitmez.
 *
 * NOT: Endpoint URL `BILLING_URL` origin'inden türetilir (aiProxy ile aynı
 * cluster). Build-time embed edilen .env değişkeni.
 */

const settings = require('./settings');
const logger = require('./logger');

const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika
const MAX_BUFFER_SIZE = 1_000; // toplam entry (captcha + login)
const POST_TIMEOUT_MS = 15_000;
const ENDPOINT_PATH = '/api/admin/telemetry/captcha-batch';

const captchaBuffer = [];
const loginBuffer = [];

let flushTimer = null;
let flushInFlight = false;
let started = false;

function getEndpointUrl() {
    const base = process.env.BILLING_URL;
    if (!base) return null;
    try {
        return new URL(ENDPOINT_PATH, new URL(base).origin).toString();
    } catch {
        return null;
    }
}

function isEnabled() {
    try {
        const s = settings.readSettings();
        if (s && s.telemetry === false) return false;
    } catch {
        // settings okunamazsa default açık
    }
    return true;
}

function getAccessToken() {
    try {
        return settings.getEncryptedValue('accessToken');
    } catch {
        return null;
    }
}

function pushBuffer(buffer, entry) {
    if (!isEnabled()) return;
    buffer.push(entry);
    // memory koruması: toplam buffer max 2*MAX_BUFFER_SIZE'a ulaşırsa eskileri at
    if (captchaBuffer.length + loginBuffer.length > MAX_BUFFER_SIZE * 2) {
        const overflow = captchaBuffer.length + loginBuffer.length - MAX_BUFFER_SIZE * 2;
        captchaBuffer.splice(0, Math.min(overflow, captchaBuffer.length));
    }
}

/**
 * Bir CAPTCHA solve attempt kaydı.
 *
 * @param {Object} e
 * @param {'crnn'|'gemini'|'tesseract'|'openai'|'claude'} e.method
 * @param {boolean} e.success
 * @param {string} [e.modelVersion]   crnn için 'v1', 'v2'...
 * @param {number} [e.confidence]     0-1
 * @param {number} [e.durationMs]
 * @param {string} [e.imageHash]
 * @param {string} [e.failureReason]  'low_confidence' | 'gib_rejected' | ...
 * @param {string} [e.attemptId]      Aynı CAPTCHA için cascade rowlarını bağlayan UUID
 *                                    (CRNN fail + Tesseract fail + AI success → 1 attemptId)
 */
function recordCaptcha(e) {
    if (!e || !e.method || typeof e.success !== 'boolean') return;
    pushBuffer(captchaBuffer, {
        method: e.method,
        model_version: e.modelVersion || null,
        success: e.success,
        confidence: typeof e.confidence === 'number' ? e.confidence : null,
        duration_ms: typeof e.durationMs === 'number' ? Math.round(e.durationMs) : null,
        image_hash: e.imageHash || null,
        failure_reason: e.failureReason || null,
        attempt_id: e.attemptId || null,
        attempted_at: new Date().toISOString(),
    });
}

/**
 * Bir GİB login attempt kaydı.
 *
 * @param {Object} e
 * @param {boolean} e.success
 * @param {string} [e.failureStage]   'captcha' | 'credentials' | 'session' | 'network' | 'rate_limit'
 * @param {number} [e.durationMs]
 * @param {number} [e.captchaIndex]   captchaBuffer içinde bağlı solve'un index'i
 *                                    (aynı flush batch'inde gönderilen entry'ler için)
 */
function recordGibLogin(e) {
    if (!e || typeof e.success !== 'boolean') return;
    pushBuffer(loginBuffer, {
        success: e.success,
        failure_stage: e.failureStage || null,
        duration_ms: typeof e.durationMs === 'number' ? Math.round(e.durationMs) : null,
        captcha_index: typeof e.captchaIndex === 'number' ? e.captchaIndex : null,
        attempted_at: new Date().toISOString(),
    });
}

async function flush() {
    if (flushInFlight) return; // dedupe concurrent flush
    if (captchaBuffer.length === 0 && loginBuffer.length === 0) return;
    if (!isEnabled()) {
        captchaBuffer.length = 0;
        loginBuffer.length = 0;
        return;
    }

    const url = getEndpointUrl();
    if (!url) {
        logger.debug('[CaptchaTelemetry] BILLING_URL yok, flush atlandı');
        return;
    }
    const token = getAccessToken();
    if (!token) {
        logger.debug('[CaptchaTelemetry] accessToken yok, flush ertelendi');
        return;
    }

    flushInFlight = true;

    // Snapshot al → POST sırasında yeni entry buffer'a eklenebilir, kaybolmazlar
    const captchaSnapshot = captchaBuffer.slice();
    const loginSnapshot = loginBuffer.slice();
    const captchaCount = captchaSnapshot.length;
    const loginCount = loginSnapshot.length;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ captcha: captchaSnapshot, gib_login: loginSnapshot }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            logger.debug(
                `[CaptchaTelemetry] flush HTTP ${res.status} ${errBody.slice(0, 200)} — buffer korunuyor`
            );
            return;
        }

        // Başarılı → snapshot'taki entry'leri buffer'dan çıkar
        captchaBuffer.splice(0, captchaCount);
        loginBuffer.splice(0, loginCount);
        logger.debug(`[CaptchaTelemetry] flush OK: captcha=${captchaCount} login=${loginCount}`);
    } catch (err) {
        logger.debug(`[CaptchaTelemetry] flush error: ${err.message} — buffer korunuyor`);
    } finally {
        flushInFlight = false;
    }
}

function start() {
    if (started) return;
    started = true;
    flushTimer = setInterval(() => {
        flush().catch((err) => logger.debug(`[CaptchaTelemetry] tick error: ${err.message}`));
    }, FLUSH_INTERVAL_MS);
    if (flushTimer.unref) flushTimer.unref(); // node event-loop blocker olmasın
    logger.debug('[CaptchaTelemetry] started, flush interval 5dk');
}

async function stop() {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    started = false;
    // Quit'te kalan entry'leri en son göndermeyi dene
    await flush().catch(() => {});
}

module.exports = {
    start,
    stop,
    flush,
    recordCaptcha,
    recordGibLogin,
    isEnabled,
};
