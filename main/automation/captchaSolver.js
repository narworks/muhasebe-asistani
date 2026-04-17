const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../logger');

let tesseractWorker = null;
let tesseractInitPromise = null;

// CAPTCHA text validation: 4-7 alphanumeric characters
const CAPTCHA_VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;

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
            logger.debug(`[CAPTCHA] Tesseract solved: ${text} (confidence: ${data.confidence})`);
            return { text, source: 'tesseract', confidence: data.confidence };
        }
        logger.debug(`[CAPTCHA] Tesseract result invalid: "${text}"`);
        return null;
    } catch (err) {
        logger.debug(`[CAPTCHA] Tesseract error: ${err.message}`);
        return null;
    }
}

/**
 * Gemini 2.0 Flash CAPTCHA solver with rate-limit retry.
 */
async function solveWithGemini(imageBase64, apiKey) {
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
            const text = response.text().trim().replace(/\s/g, '');
            logger.debug(`[CAPTCHA] Gemini solved: ${text}`);
            return { text, source: 'gemini' };
        } catch (err) {
            const isRateLimit =
                err.message &&
                (err.message.includes('429') ||
                    err.message.includes('Rate') ||
                    err.message.includes('exhausted'));
            if (isRateLimit && attempt < 3) {
                const waitSec = 30 * attempt;
                logger.debug(`[CAPTCHA] Gemini rate limited, waiting ${waitSec}s (${attempt}/3)`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
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
    // Try local OCR first
    const tesseractResult = await solveWithTesseract(imageBase64);
    if (tesseractResult) {
        return tesseractResult.text;
    }

    // Fallback to Gemini
    const geminiResult = await solveWithGemini(imageBase64, apiKey);
    return geminiResult.text;
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

module.exports = { solveCaptcha, solveWithTesseract, solveWithGemini, terminate };
