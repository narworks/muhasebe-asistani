const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../logger');

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

async function solveCaptchaWithGemini(imageBase64, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const result = await model.generateContent([
                {
                    text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.',
                },
                { inlineData: { mimeType: 'image/png', data: imageBase64 } },
            ]);
            const response = await result.response;
            return response.text().trim().replace(/\s/g, '');
        } catch (err) {
            const isRateLimit =
                err.message &&
                (err.message.includes('429') ||
                    err.message.includes('Rate') ||
                    err.message.includes('exhausted'));
            if (isRateLimit && attempt < 3) {
                const waitSec = 30 * attempt;
                logger.debug(
                    `[HTTP-Login] Gemini rate limited, waiting ${waitSec}s (attempt ${attempt}/3)`
                );
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }
            throw err;
        }
    }
}

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
        try {
            const captcha = await fetchCaptcha();
            logger.debug(`[HTTP-Login] CAPTCHA fetched (cid: ${captcha.cid.substring(0, 8)}...)`);

            const captchaText = await solveCaptchaWithGemini(captcha.imageBase64, apiKey);
            logger.debug(`[HTTP-Login] CAPTCHA solved: ${captchaText}`);

            const result = await postLogin(userid, password, captchaText, captcha.cid);

            if (result.token) {
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

            logger.debug(
                `[HTTP-Login] Attempt ${attempt}/${maxAttempts}: ${err.errorType} — ${err.message}`
            );

            if (
                err.errorType === 'ip_blocked' ||
                err.errorType === 'wrong_credentials' ||
                err.errorType === 'account_locked'
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

module.exports = { httpLogin, fetchCaptcha, solveCaptchaWithGemini };
