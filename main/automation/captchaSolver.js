const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../logger');
const { withTimeout } = require('./withTimeout');
const aiProxy = require('./aiProxy');
const captchaCRNN = require('./captchaCRNN');
const captchaTelemetry = require('../captchaTelemetry');

let tesseractWorker = null;
let tesseractInitPromise = null;

// CAPTCHA text validation: 4-7 alphanumeric characters
const CAPTCHA_VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;

// NOT (eski): CRNN confidence threshold yaklaşımı KALDIRILDI.
// GİB feedback retry stratejisi (solveCaptchaWithSource attempt parameter)
// CRNN'in pre-validation threshold'una güvenmek yerine GİB'in gerçek
// validasyonuna güveniyor. CRNN format-valid her tahmini submit edilir,
// yanlışsa caller attempt 2 ile AI cascade'e düşer. AI bağımlılığı %86 → %20.

// Aggregate solver stats (exposed for telemetry)
const stats = {
    crnn_success: 0,
    crnn_lowconf: 0,
    crnn_invalid: 0,
    crnn_error: 0,
    tesseract_success: 0,
    tesseract_fail: 0,
    gemini_success: 0,
    gemini_fail: 0,
    openai_success: 0,
    openai_fail: 0,
    claude_success: 0,
    claude_fail: 0,
};

// Multi-AI cascade — Gemini (proxy) → OpenAI → Claude. Tek bir provider
// throttle/ban olursa diğerlerine düşer. Tek katmanlı Gemini'den çok daha
// güvenli, AI fallback accuracy'sini %95 → %99'a çıkarır.
const AI_LABEL_PROMPT =
    'Bu resimdeki CAPTCHA metnini oku. Sadece metni döndür, boşluksuz. ' +
    'Karakterler büyük/küçük harf veya rakam olabilir, 4-7 karakter uzunluğunda. ' +
    'Başka hiçbir açıklama yazma.';
const AI_PROVIDER_TIMEOUT_MS = 30_000;

function resetStats() {
    Object.keys(stats).forEach((k) => (stats[k] = 0));
}

function hashImageShort(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
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

        // Tesseract bazen conf=0 ile garbage döndürüyor — bunu invalid say.
        // GİB tarafında "captcha_failed" yiyip retry zorlanıyor (gereksiz CAPTCHA).
        const TESSERACT_MIN_CONFIDENCE = 50;
        if (CAPTCHA_VALID_REGEX.test(text) && data.confidence >= TESSERACT_MIN_CONFIDENCE) {
            stats.tesseract_success++;
            logger.debug(`[CAPTCHA] Tesseract solved: ${text} (confidence: ${data.confidence})`);
            return { text, source: 'tesseract', confidence: data.confidence };
        }
        stats.tesseract_fail++;
        logger.debug(
            `[CAPTCHA] Tesseract result rejected: "${text}" (conf=${data.confidence}, regex=${CAPTCHA_VALID_REGEX.test(text)})`
        );
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
    // 2026-06-07 incident: Google gemini-2.0-flash'ı deprecate edip 404 dönmeye
    // başladı (Sentry MUHASEBE-ASISTANI-29). CAPTCHA fallback tamamen koptu →
    // GIB login fail oranı patladı. gemini-2.5-flash'a yükseltildi (stabil + güncel).
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
 * OpenAI GPT-4o Vision — multi-AI cascade'de 2. provider.
 * OPENAI_API_KEY env var beklenir (build-time embed via env-config.js).
 */
async function solveWithOpenAI(imageBase64) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY missing');
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const response = await withTimeout(
        client.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 20,
            temperature: 0,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: AI_LABEL_PROMPT },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${imageBase64}`,
                                detail: 'low',
                            },
                        },
                    ],
                },
            ],
        }),
        AI_PROVIDER_TIMEOUT_MS,
        'OpenAI Vision'
    );
    const text = (response.choices[0]?.message?.content || '').trim().replace(/\s/g, '');
    if (!CAPTCHA_VALID_REGEX.test(text)) throw new Error(`Invalid OpenAI label: "${text}"`);
    return { text, source: 'openai' };
}

/**
 * Anthropic Claude Vision — multi-AI cascade'de 3. provider.
 * ANTHROPIC_API_KEY env var beklenir.
 */
async function solveWithClaude(imageBase64) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });
    const response = await withTimeout(
        client.messages.create({
            model: 'claude-opus-4-7',
            max_tokens: 20,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: imageBase64,
                            },
                        },
                        { type: 'text', text: AI_LABEL_PROMPT },
                    ],
                },
            ],
        }),
        AI_PROVIDER_TIMEOUT_MS,
        'Claude Vision'
    );
    const text = (response.content?.[0]?.type === 'text' ? response.content[0].text : '')
        .trim()
        .replace(/\s/g, '');
    if (!CAPTCHA_VALID_REGEX.test(text)) throw new Error(`Invalid Claude label: "${text}"`);
    return { text, source: 'claude' };
}

/**
 * AI Cascade — Gemini → OpenAI → Claude. Bir provider throttle/ban
 * yerse otomatik diğerine geçer. Hibrit accuracy %99-99.5 sağlar.
 *
 * Provider sırası bilinçli: Gemini en ucuz + en hızlı, fail olunca pahalı
 * ama çok doğru OpenAI/Claude denenir.
 */
async function solveWithAICascade(imageBase64, geminiApiKey) {
    const errors = [];

    // 1) Gemini (mevcut, proxy üzerinden)
    try {
        const r = await solveWithGemini(imageBase64, geminiApiKey);
        return { text: r.text, source: 'gemini' };
    } catch (err) {
        stats.gemini_fail++;
        errors.push(`gemini: ${err.message}`);
        logger.debug(`[CAPTCHA] Gemini fail: ${err.message}, OpenAI fallback`);
    }

    // 2) OpenAI Vision
    try {
        const r = await solveWithOpenAI(imageBase64);
        stats.openai_success++;
        return r;
    } catch (err) {
        stats.openai_fail++;
        errors.push(`openai: ${err.message}`);
        logger.debug(`[CAPTCHA] OpenAI fail: ${err.message}, Claude fallback`);
    }

    // 3) Claude Vision
    try {
        const r = await solveWithClaude(imageBase64);
        stats.claude_success++;
        return r;
    } catch (err) {
        stats.claude_fail++;
        errors.push(`claude: ${err.message}`);
        logger.debug(`[CAPTCHA] Claude fail: ${err.message}`);
    }

    const aggregate = new Error(`All AI providers failed: ${errors.join(' | ')}`);
    aggregate.errorType = 'ai_all_failed';
    throw aggregate;
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
 * Same as solveCaptcha but returns { text, source }.
 *
 * GİB feedback retry akışı:
 *   attempt 1: CRNN (threshold YOK) → format-valid her tahmini submit et.
 *              GİB kabul ederse local çözüm, AI hiç çağrılmaz.
 *              GİB reddederse caller (gibHttpLogin) attempt 2 başlatır.
 *   attempt >1: CRNN+Tesseract bypass, AI cascade direkt.
 *
 * CRNN test acc %80 → attempt 1'de %80 lokal başarı, %20 retry'da AI.
 * AI bağımlılığı %86 (önceki threshold-based) → %20.
 *
 * @param {string} imageBase64
 * @param {string} apiKey  Gemini API key
 * @param {Object} [options]
 * @param {number} [options.attempt=1]  1=local first, >1=AI direct
 */
async function solveCaptchaWithSource(imageBase64, apiKey, options = {}) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const imageHash = hashImageShort(buffer);
    const attempt = options.attempt || 1;
    const skipLocal = attempt > 1;
    // attempt_id: bu CAPTCHA çözüm denemesinin tüm rowlarını (CRNN fail + Tesseract fail
    // + AI success gibi cascade satırlarını) bağlar — dashboard %başarı'yı GROUP BY
    // attempt_id, MAX(success) ile hesaplar (per-row değil per-CAPTCHA).
    const attemptId = crypto.randomUUID();

    // --- 1) CRNN (lokal, sadece attempt=1) ---
    if (!skipLocal && captchaCRNN.isAvailable()) {
        try {
            const r = await captchaCRNN.solve(buffer);
            const validFormat = CAPTCHA_VALID_REGEX.test(r.text);

            // GİB feedback retry: confidence threshold YOK. Format-valid her CRNN
            // tahmini submit edilir; doğruluğu GİB validation belirler. Yanlışsa
            // caller attempt 2 ile bizi tekrar çağırır (skipLocal=true → AI).
            if (validFormat) {
                stats.crnn_success++;
                captchaTelemetry.recordCaptcha({
                    method: 'crnn',
                    modelVersion: r.modelVersion,
                    success: true, // optimistic — GİB reject ederse attempt 2'de AI
                    confidence: r.confidence,
                    durationMs: r.latencyMs,
                    imageHash,
                    attemptId,
                });
                logger.debug(
                    `[CAPTCHA] CRNN solved: ${r.text} (conf=${r.confidence.toFixed(3)}, ${r.latencyMs}ms)`
                );
                return { text: r.text, source: 'crnn' };
            }
            stats.crnn_invalid++;
            captchaTelemetry.recordCaptcha({
                method: 'crnn',
                modelVersion: r.modelVersion,
                success: false,
                confidence: r.confidence,
                imageHash,
                failureReason: 'invalid_format',
                attemptId,
            });
            logger.debug(`[CAPTCHA] CRNN invalid format ("${r.text}"), Tesseract fallback`);
        } catch (err) {
            stats.crnn_error++;
            captchaTelemetry.recordCaptcha({
                method: 'crnn',
                success: false,
                imageHash,
                failureReason: 'model_error',
                attemptId,
            });
            logger.debug(`[CAPTCHA] CRNN error: ${err.message}, Tesseract+Gemini fallback`);
        }
    }

    // --- 2) Tesseract (lokal, sadece attempt=1, CRNN format invalid sonrası) ---
    if (!skipLocal) {
        const tesStart = Date.now();
        const tesseractResult = await solveWithTesseract(imageBase64);
        if (tesseractResult) {
            captchaTelemetry.recordCaptcha({
                method: 'tesseract',
                success: true,
                confidence: tesseractResult.confidence ? tesseractResult.confidence / 100 : null,
                durationMs: Date.now() - tesStart,
                imageHash,
                attemptId,
            });
            return { text: tesseractResult.text, source: 'tesseract' };
        }
        captchaTelemetry.recordCaptcha({
            method: 'tesseract',
            success: false,
            durationMs: Date.now() - tesStart,
            imageHash,
            failureReason: 'invalid_format',
            attemptId,
        });
    }

    // --- 3) AI Cascade (Gemini → OpenAI → Claude) ---
    // attempt > 1 (GİB reject sonrası) veya tüm local solver'lar fail.
    const aiStart = Date.now();
    try {
        const aiResult = await solveWithAICascade(imageBase64, apiKey);
        captchaTelemetry.recordCaptcha({
            method: aiResult.source, // 'gemini' | 'openai' | 'claude'
            success: true,
            durationMs: Date.now() - aiStart,
            imageHash,
            attemptId,
        });
        return aiResult;
    } catch (err) {
        captchaTelemetry.recordCaptcha({
            method: 'gemini', // cascade ilk provider — fail toplandı
            success: false,
            durationMs: Date.now() - aiStart,
            imageHash,
            failureReason:
                err.errorType === 'ai_rate_limit'
                    ? 'timeout'
                    : err.errorType === 'ai_all_failed'
                      ? 'unknown'
                      : 'unknown',
            attemptId,
        });
        throw err;
    }
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
    try {
        await captchaCRNN.terminate();
    } catch {
        /* ignore */
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
