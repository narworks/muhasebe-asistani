const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../logger');
const { withTimeout } = require('./withTimeout');
const aiProxy = require('./aiProxy');

let tesseractWorker = null;
let tesseractInitPromise = null;

// CAPTCHA text validation: 4-7 alphanumeric characters
const CAPTCHA_VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;

// Aggregate solver stats (exposed for telemetry)
const stats = {
    tesseract_success: 0,
    tesseract_fail: 0,
    gemini_success: 0,
    gemini_fail: 0,
};

function resetStats() {
    stats.tesseract_success = 0;
    stats.tesseract_fail = 0;
    stats.gemini_success = 0;
    stats.gemini_fail = 0;
}

function getStats() {
    return { ...stats };
}

/**
 * Lazy-initialize Tesseract worker. Single worker reused across solves.
 * First call pays ~500ms init cost, subsequent calls are fast.
 */
async function getTesseractWorker() {
    if (tesseractWorker) return tesseractWorker;
    if (tesseractInitPromise) return tesseractInitPromise;

    tesseractInitPromise = (async () => {
        const { createWorker } = require('tesseract.js');
        const worker = await createWorker('eng', 1, {
            logger: () => {}, // silent
        });
        await worker.setParameters({
            tessedit_char_whitelist:
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            tessedit_pageseg_mode: '7', // single line
        });
        tesseractWorker = worker;
        return worker;
    })();

    return tesseractInitPromise;
}

/**
 * Preprocess CAPTCHA image with Sharp for better OCR accuracy:
 * upscale 2x → grayscale → normalize contrast → median filter → threshold.
 */
async function preprocessCaptcha(imageBuffer) {
    const sharp = require('sharp');
    return await sharp(imageBuffer)
        .resize({ height: 90, kernel: 'lanczos3' })
        .grayscale()
        .normalise()
        .median(1)
        .threshold(140)
        .toBuffer();
}

/**
 * Try Tesseract OCR with preprocessing. Returns null on failure.
 */
async function solveWithTesseract(imageBase64) {
    try {
        const worker = await getTesseractWorker();
        const inputBuffer = Buffer.from(imageBase64, 'base64');
        const processed = await preprocessCaptcha(inputBuffer);
        const { data } = await worker.recognize(processed);
        const text = (data.text || '').trim().replace(/\s+/g, '');

        if (CAPTCHA_VALID_REGEX.test(text)) {
            stats.tesseract_success++;
            logger.debug(`[CAPTCHA] Tesseract solved: ${text} (confidence: ${data.confidence})`);
            return { text, source: 'tesseract', confidence: data.confidence };
        }
        stats.tesseract_fail++;
        logger.debug(`[CAPTCHA] Tesseract result invalid: "${text}"`);
        return null;
    } catch (err) {
        stats.tesseract_fail++;
        logger.debug(`[CAPTCHA] Tesseract error: ${err.message}`);
        return null;
    }
}

// CAPTCHA-specific timeout: images are small (single frame), solve should be
// fast. 30s covers cold starts + retries without leaving the scan stuck.
const GEMINI_TIMEOUT_MS = 30_000;

/**
 * Gemini 2.0 Flash CAPTCHA solver. Proxy-first: landing backend üzerinden
 * çağrı yapar (API key bundle'da açık olmasın diye). Proxy fail olursa
 * direkt Gemini SDK'ya düşer — grace period bitip direkt path kaldırılana
 * kadar kullanıcı fail yaşamaz.
 *
 * Proxy çağrıları timeout, auth fail, rate limit vs. için düzgünce hata
 * fırlatır (ProxyError); direct Gemini'ye düşüşte Sentry'ye warning atılır
 * ki proxy health'ini gözlemleyebilelim.
 */
async function solveWithGemini(imageBase64, apiKey) {
    // Proxy-first path — user access_token ile landing /api/ai/captcha-solve
    if (aiProxy.isProxyEnabled()) {
        try {
            const result = await aiProxy.solveCaptcha(imageBase64);
            stats.gemini_success++;
            logger.debug(`[CAPTCHA] Proxy solved: ${result.text}`);
            return { text: result.text, source: 'gemini' };
        } catch (err) {
            // Rate limit (429) proxy tarafında — direct Gemini da aynı quota'dan
            // düşeceği için retry etmez. Diğer error'larda direct fallback.
            if (err.status === 429) {
                stats.gemini_fail++;
                logger.debug(`[CAPTCHA] Proxy rate limited: ${err.message}`);
                err.errorType = 'ai_rate_limit';
                throw err;
            }
            logger.debug(
                `[CAPTCHA] Proxy fail (${err.code}), falling back to direct Gemini: ${err.message}`
            );
            // fall through to direct path below
        }
    }

    // Direct Gemini SDK — grace period için korundu. 2-4 hafta sonra
    // proxy stable olunca bu yol kaldırılır + GEMINI_API_KEY bundle'dan
    // silinir (Phase 2 sunset adımı).
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const result = await withTimeout(
                model.generateContent([
                    {
                        text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.',
                    },
                    { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                ]),
                GEMINI_TIMEOUT_MS,
                'Gemini CAPTCHA'
            );
            const response = await result.response;
            const text = response.text().trim().replace(/\s/g, '');
            stats.gemini_success++;
            logger.debug(`[CAPTCHA] Gemini solved: ${text}`);
            return { text, source: 'gemini' };
        } catch (err) {
            const isRateLimit =
                err.message &&
                (err.message.includes('429') ||
                    err.message.includes('Rate') ||
                    err.message.includes('exhausted') ||
                    err.message.toLowerCase().includes('too many requests'));
            const isTimeout = err.errorType === 'gemini_timeout';
            if ((isRateLimit || isTimeout) && attempt < 3) {
                const waitSec = isTimeout ? 5 : 30 * attempt;
                logger.debug(
                    `[CAPTCHA] Gemini ${isTimeout ? 'timed out' : 'rate limited'}, waiting ${waitSec}s (${attempt}/3)`
                );
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }
            stats.gemini_fail++;
            if (isRateLimit) {
                err.errorType = 'ai_rate_limit';
            }
            throw err;
        }
    }
}

/**
 * Hybrid CAPTCHA solver: Tesseract first (local, fast), Gemini fallback (slow, accurate).
 * @param {string} imageBase64 - PNG image as base64 string
 * @param {string} apiKey - Gemini API key for fallback
 * @returns {Promise<string>} solved CAPTCHA text
 */
async function solveCaptcha(imageBase64, apiKey) {
    const result = await solveCaptchaWithSource(imageBase64, apiKey);
    return result.text;
}

/**
 * Same as solveCaptcha but returns { text, source } to let callers log solver stats.
 */
async function solveCaptchaWithSource(imageBase64, apiKey) {
    const tesseractResult = await solveWithTesseract(imageBase64);
    if (tesseractResult) {
        return { text: tesseractResult.text, source: 'tesseract' };
    }
    const geminiResult = await solveWithGemini(imageBase64, apiKey);
    return { text: geminiResult.text, source: 'gemini' };
}

/**
 * Cleanup: terminate Tesseract worker.
 * Called on app quit to release resources.
 */
async function terminate() {
    if (tesseractWorker) {
        try {
            await tesseractWorker.terminate();
        } catch {
            /* ignore */
        }
        tesseractWorker = null;
        tesseractInitPromise = null;
    }
}

module.exports = {
    solveCaptcha,
    solveCaptchaWithSource,
    solveWithTesseract,
    solveWithGemini,
    terminate,
    getStats,
    resetStats,
};
