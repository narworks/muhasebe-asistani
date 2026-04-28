/**
 * AI Backend Proxy wrapper — CAPTCHA + statement convert isteklerini
 * landing'in `/api/ai/*` endpoint'lerine gönderir. GEMINI_API_KEY'in
 * desktop bundle'da bulunmasından kaynaklanan exposure riskini kapatır
 * (binary decompile → key extract). Per-user rate limit ve usage
 * accounting da backend tarafında mümkün olur.
 *
 * Fallback stratejisi: proxy herhangi bir sebeple fail ederse (network,
 * 5xx, auth, token expired vs.) callerlar yakalar ve direkt Gemini
 * SDK'ya düşer. Yani backend down olsa bile scan akışı çalışır.
 *
 * Feature flag: `settings.aiProxy.enabled` — default true v1.7.20'den
 * itibaren. User manuel false yaparsa (debug/outage durumunda) direkt
 * Gemini kullanılır.
 */

const settings = require('../settings');
const logger = require('../logger');

// Origin'i URL parse ile çıkar — BILLING_URL "/billing" yerine "/pricing"
// gibi farklı bir path ile gelse de host doğru çözülür. Eski kod sadece
// "/billing" suffix'ini regex ile silerken "/pricing" gibi değerlerde
// path olduğu gibi kalıp PROXY_BASE bozuluyordu (CI secret v1.7.20'den
// beri yanlış set edildiği için /api/ai/* çağrıları 404 yiyordu).
function deriveProxyOrigin() {
    const candidates = [process.env.AI_PROXY_URL, process.env.BILLING_URL];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            return new URL(candidate).origin;
        } catch {
            // invalid URL → bir sonraki adaya geç
        }
    }
    return 'https://muhasebeasistani.com';
}

const PROXY_BASE = deriveProxyOrigin();

const DEFAULT_TIMEOUT_MS = 150_000; // statement convert için headroom dahil

/**
 * Proxy feature flag — settings'ten okunur. Default true (v1.7.20+).
 * false yapılırsa tüm callerlar direkt Gemini'ye gider.
 */
function isProxyEnabled() {
    try {
        const s = settings.readSettings() || {};
        // Explicit false sadece; undefined/null → enabled
        return s.aiProxy?.enabled !== false;
    } catch {
        return true;
    }
}

/**
 * Desktop'ın logged-in user'ının access_token'ını güvenli depolamadan
 * okur. Token yoksa (logged-out durumda) proxy çağrısı anlamsız,
 * caller fallback'e düşer.
 */
function getAccessToken() {
    try {
        return settings.getEncryptedValue('accessToken');
    } catch (err) {
        logger.debug(`[aiProxy] getEncryptedValue error: ${err.message}`);
        return null;
    }
}

/**
 * Single fetch attempt — internal helper, no retry mantığı içermiyor.
 */
async function singleFetch(endpoint, body, accessToken, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${PROXY_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            let errorBody = {};
            try {
                errorBody = await res.json();
            } catch {
                /* body parse fail — yeni objesiz devam */
            }
            const err = new Error(errorBody.error || `Proxy HTTP ${res.status}: ${res.statusText}`);
            err.code = 'PROXY_HTTP';
            err.status = res.status;
            err.retryAfter = res.headers.get('Retry-After');
            throw err;
        }

        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            const timeoutErr = new Error(`Proxy timeout after ${timeoutMs}ms`);
            timeoutErr.code = 'PROXY_TIMEOUT';
            throw timeoutErr;
        }
        // Network error, JSON parse error, vs. — caller fallback'e düşsün
        if (!err.code) err.code = 'PROXY_NETWORK';
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Proxy endpoint çağrısı. Başarı durumunda JSON döner; hata durumunda
 * ProxyError fırlatır (caller yakalar, fallback'e düşer).
 *
 * 401 alındığında bir kez token refresh + retry yapar — Supabase JWT 1
 * saatte expire olur, license modülü 50dk'da bir auto-refresh ediyor ama
 * race window'da 401 olabilir. Tek retry yeterli; refresh fail olursa
 * direkt fırlatır, caller fallback Gemini'ye düşer.
 */
async function callProxy(endpoint, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const accessToken = getAccessToken();
    if (!accessToken) {
        const err = new Error('No access token — user not logged in');
        err.code = 'NO_TOKEN';
        throw err;
    }

    try {
        return await singleFetch(endpoint, body, accessToken, timeoutMs);
    } catch (err) {
        // 401 → token expired olabilir, refresh + retry
        if (err.code === 'PROXY_HTTP' && err.status === 401) {
            const license = require('../license');
            const refreshed = await license.ensureFreshToken();
            if (refreshed) {
                logger.debug('[aiProxy] Token refreshed after 401, retrying');
                const newToken = getAccessToken();
                if (newToken) {
                    return await singleFetch(endpoint, body, newToken, timeoutMs);
                }
            }
        }
        throw err;
    }
}

/**
 * CAPTCHA çöz isteği. imageBase64 → metin.
 */
async function solveCaptcha(imageBase64) {
    const result = await callProxy('/api/ai/captcha-solve', { imageBase64 }, 30_000);
    if (!result?.text) {
        const err = new Error('Proxy response missing text');
        err.code = 'PROXY_BAD_RESPONSE';
        throw err;
    }
    return { text: result.text, source: 'gemini-proxy' };
}

/**
 * Statement (banka ekstresi) CSV'ye çevir. systemPrompt desktop tarafında
 * composed edilmiş tam prompt olarak gelir — proxy değiştirmeden iletir.
 */
async function convertStatement(systemPrompt) {
    const result = await callProxy(
        '/api/ai/statement-convert',
        { systemPrompt },
        150_000 // ~2.5dk statement convert için tolerans
    );
    if (typeof result?.csv !== 'string') {
        const err = new Error('Proxy response missing csv');
        err.code = 'PROXY_BAD_RESPONSE';
        throw err;
    }
    return result.csv;
}

module.exports = {
    isProxyEnabled,
    solveCaptcha,
    convertStatement,
    PROXY_BASE,
};
