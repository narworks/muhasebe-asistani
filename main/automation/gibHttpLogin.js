const axios = require('axios');
const logger = require('../logger');
const captchaSolver = require('./captchaSolver');
const tokenCache = require('./gibTokenCache');
const captchaTelemetry = require('../captchaTelemetry');

// errorType → captcha_telemetry.gib_login.failure_stage enum mapping
// Schema enum: 'captcha' | 'credentials' | 'session' | 'network' | 'rate_limit'
function errorTypeToFailureStage(errorType) {
    switch (errorType) {
        case 'captcha_failed':
            return 'captcha';
        case 'wrong_credentials':
        case 'account_locked':
            return 'credentials';
        case 'ip_blocked':
        case 'ai_rate_limit':
            return 'rate_limit';
        case 'network_timeout':
            return 'network';
        default:
            return null;
    }
}

const GIB_API_BASE = 'https://dijital.gib.gov.tr/apigateway';
const CAPTCHA_URL = `${GIB_API_BASE}/captcha/getnewcaptcha`;
const LOGIN_URL = `${GIB_API_BASE}/auth/tdvd/login`;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
    'User-Agent': USER_AGENT,
    Referer: 'https://dijital.gib.gov.tr/',
    Origin: 'https://dijital.gib.gov.tr',
    Accept: 'application/json, text/plain, */*',
};

async function fetchCaptcha() {
    const resp = await axios.get(CAPTCHA_URL, {
        headers: { ...COMMON_HEADERS, Referer: 'https://dijital.gib.gov.tr/portal/login' },
        timeout: 15000,
    });
    const { captchaImgBase64, cid } = resp.data;
    if (!captchaImgBase64 || !cid) {
        throw new Error('CAPTCHA verisi alınamadı');
    }
    return { imageBase64: captchaImgBase64, cid };
}

// CAPTCHA solving delegated to captchaSolver (Tesseract local + Gemini fallback)

async function postLogin(userid, sifre, captchaText, captchaCid) {
    const resp = await axios.post(
        LOGIN_URL,
        {
            userid,
            sifre,
            dk: captchaText,
            imageId: captchaCid,
            controlCaptcha: true,
        },
        {
            headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json' },
            timeout: 15000,
        }
    );
    return resp.data;
}

function classifyLoginError(data) {
    if (!data || !data.messages || !data.messages.length) {
        return { type: 'unknown', message: 'Bilinmeyen giriş hatası' };
    }

    const msg = (data.messages[0].text || '').toLocaleLowerCase('tr-TR');
    const code = data.messages[0].code || '';

    if (code.includes('invalid.userid') || msg.includes('geçerli bir')) {
        return { type: 'wrong_credentials', message: data.messages[0].text };
    }
    if (msg.includes('güvenlik kod') || msg.includes('captcha') || msg.includes('doğrulama')) {
        return { type: 'captcha_failed', message: data.messages[0].text };
    }
    if (
        msg.includes('şifre') ||
        msg.includes('parola') ||
        msg.includes('hatalı') ||
        msg.includes('yanlış gir')
    ) {
        return { type: 'wrong_credentials', message: data.messages[0].text };
    }
    if (msg.includes('kilitli') || msg.includes('çok fazla') || msg.includes('too many')) {
        return { type: 'account_locked', message: data.messages[0].text };
    }
    if (msg.includes('engel') || msg.includes('blok') || msg.includes('blocked')) {
        return { type: 'ip_blocked', message: data.messages[0].text };
    }

    return { type: 'captcha_failed', message: data.messages[0].text };
}

/**
 * HTTP-only login: CAPTCHA fetch + Gemini solve + POST login.
 * Returns { token } on success, throws classified error on failure.
 * ~3-5s per attempt vs ~30-45s with Puppeteer.
 */
async function httpLogin(userid, password, apiKey, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptStart = Date.now();
        try {
            const captcha = await fetchCaptcha();
            logger.debug(`[HTTP-Login] CAPTCHA fetched (cid: ${captcha.cid.substring(0, 8)}...)`);

            // GİB feedback retry: attempt 1 = CRNN+Tesseract local, attempt >1 = AI direct.
            // CRNN'in tahmini yanlışsa GİB "captcha_failed" döndürür → retry attempt 2'de
            // AI cascade çağrılır (bypass local). AI bağımlılığını minimize eder.
            const captchaResult = await captchaSolver.solveCaptchaWithSource(
                captcha.imageBase64,
                apiKey,
                { attempt }
            );
            const captchaText = captchaResult.text;
            logger.debug(
                `[HTTP-Login] CAPTCHA solved by ${captchaResult.source} (attempt ${attempt}): ${captchaText}`
            );
            logger.debug(`[HTTP-Login] CAPTCHA solved: ${captchaText}`);

            const result = await postLogin(userid, password, captchaText, captcha.cid);

            if (result.token) {
                captchaTelemetry.recordGibLogin({
                    success: true,
                    durationMs: Date.now() - attemptStart,
                });
                logger.debug('[HTTP-Login] Bearer token acquired');
                return { token: result.token };
            }

            const errorInfo = classifyLoginError(result);
            const err = new Error(errorInfo.message);
            err.errorType = errorInfo.type;
            throw err;
        } catch (err) {
            if (err.response && err.response.data) {
                const errorInfo = classifyLoginError(err.response.data);
                err.errorType = errorInfo.type;
                err.message = errorInfo.message;
            }

            if (!err.errorType) {
                if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                    err.errorType = 'network_timeout';
                } else {
                    err.errorType = 'unknown';
                }
            }

            captchaTelemetry.recordGibLogin({
                success: false,
                failureStage: errorTypeToFailureStage(err.errorType),
                durationMs: Date.now() - attemptStart,
            });

            logger.debug(
                `[HTTP-Login] Attempt ${attempt}/${maxAttempts}: ${err.errorType} — ${err.message}`
            );

            if (
                err.errorType === 'ip_blocked' ||
                err.errorType === 'wrong_credentials' ||
                err.errorType === 'account_locked' ||
                err.errorType === 'ai_rate_limit'
            ) {
                throw err;
            }

            if (err.errorType === 'captcha_failed' && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }

            if (err.errorType === 'network_timeout' && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 5000));
                continue;
            }

            if (attempt >= maxAttempts) {
                throw err;
            }
        }
    }
}

/**
 * Token cache aware login: önce disk cache'e bak, valid token varsa CAPTCHA
 * çözmeden onu döndür. Yoksa httpLogin (CAPTCHA + login) çağır + cache'le.
 *
 * Caller (genelde gibAutomation.httpLoginAndFetch) bu fonksiyonu kullanır —
 * mevcut httpLogin'i drop-in replace eder, ek field { fromCache: bool } ekler.
 *
 * 401 detection: caller apiClient'tan 401 alırsa
 *   tokenCache.invalidateToken(userid)
 *   loginOrReuseToken(...) // bu sefer cache miss → fresh login
 */
async function loginOrReuseToken(userid, password, apiKey, maxAttempts = 3) {
    const cached = tokenCache.getValidToken(userid);
    if (cached) {
        logger.debug(`[HTTP-Login] Token cache HIT — CAPTCHA atlandı (${userid.slice(0, 4)}***)`);
        return { token: cached, fromCache: true };
    }

    logger.debug(`[HTTP-Login] Token cache MISS — fresh login (${userid.slice(0, 4)}***)`);
    const result = await httpLogin(userid, password, apiKey, maxAttempts);
    if (result && result.token) {
        tokenCache.setToken(userid, result.token);
    }
    return { ...result, fromCache: false };
}

module.exports = { httpLogin, fetchCaptcha, loginOrReuseToken };
