/**
 * CRNN CAPTCHA solver — UtilityProcess wrapper.
 *
 * Lazy initialization: ilk solve isteğinde child process spawn edilir,
 * model yüklenir (~200ms cold start), sonra her inference 30-60ms.
 *
 * API:
 *   const crnn = require('./captchaCRNN');
 *   const { text, confidence } = await crnn.solve(imageBuffer);
 *   await crnn.terminate(); // app quit'te
 *
 * Production'a CRNN model olmadan da bundle edilebilir — `isAvailable()`
 * ile kontrol et, yoksa solver Tesseract+Gemini hibrit'inde kal.
 */

const { app, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../logger');

// Model dosyaları extraResources ile bundle'da:
//   process.resourcesPath/captcha-model/captcha-v1-seed2.int8.onnx
//   process.resourcesPath/captcha-model/captcha-v1.metadata.json
// Dev mode'da `main/automation/models/` altında bekleniyor.
//
// Production'da seed2 (en iyi tek model, val %81.25, test %79.95) kullanılır.
// Ensemble logit-averaging bug nedeniyle drop edildi (logit avg → %0 acc).
// Sequence-level voting ileride opsiyon, ama tek model + threshold 0.99 +
// multi-AI cascade ile hibrit %99 sağlanıyor → ensemble gerekmiyor.
function getModelPaths() {
    const isDev = !app.isPackaged;
    const baseDir = isDev
        ? path.join(__dirname, 'models')
        : path.join(process.resourcesPath, 'captcha-model');

    // Seed2 öncelikli, fallback olarak tek captcha-v1.int8.onnx
    const seed2Path = path.join(baseDir, 'captcha-v1-seed2.int8.onnx');
    const fallbackPath = path.join(baseDir, 'captcha-v1.int8.onnx');
    const modelPath = fs.existsSync(seed2Path) ? seed2Path : fallbackPath;

    return {
        modelPaths: [modelPath],
        metadataPath: path.join(baseDir, 'captcha-v1.metadata.json'),
        ensembleSize: 1,
    };
}

function isAvailable() {
    const { modelPaths, metadataPath } = getModelPaths();
    return modelPaths.every((p) => fs.existsSync(p)) && fs.existsSync(metadataPath);
}

let child = null;
let initPromise = null;
let nextRequestId = 1;
const pending = new Map(); // requestId → { resolve, reject }

const stats = {
    totalRequests: 0,
    successes: 0,
    failures: 0,
    workerCrashes: 0,
};

function getStats() {
    return { ...stats };
}

function spawnChild() {
    if (!isAvailable()) {
        throw new Error('CRNN model dosyası bulunamadı (captcha-v1.int8.onnx)');
    }

    const workerPath = path.join(__dirname, 'captchaInferenceWorker.js');
    child = utilityProcess.fork(workerPath, [], {
        serviceName: 'captcha-crnn-worker',
        stdio: 'inherit',
    });

    child.on('message', (msg) => {
        const { requestId, type } = msg;
        const p = pending.get(requestId);
        if (!p) return;
        pending.delete(requestId);
        if (type === 'error') p.reject(new Error(msg.error));
        else p.resolve(msg);
    });

    child.on('exit', (code) => {
        logger.debug(`[CRNN] Worker exited code=${code}`);
        const wasAlive = child !== null;
        child = null;
        initPromise = null;
        // Pending request'leri reject et
        for (const [, p] of pending) {
            p.reject(new Error('Worker exited unexpectedly'));
        }
        pending.clear();
        if (wasAlive && code !== 0) {
            stats.workerCrashes++;
        }
    });
}

function sendRequest(payload) {
    return new Promise((resolve, reject) => {
        const requestId = nextRequestId++;
        pending.set(requestId, { resolve, reject });
        try {
            child.postMessage({ ...payload, requestId });
        } catch (err) {
            pending.delete(requestId);
            reject(err);
        }
        // Per-request timeout — worker hung olursa main akışı bloklamaz
        setTimeout(() => {
            if (pending.has(requestId)) {
                pending.delete(requestId);
                reject(new Error(`CRNN request ${requestId} timeout (10s)`));
            }
        }, 10_000);
    });
}

async function ensureInit() {
    if (child && initPromise) return initPromise;
    spawnChild();
    const { modelPaths, metadataPath, ensembleSize } = getModelPaths();
    logger.debug(
        `[CRNN] Init: ${ensembleSize > 1 ? `ensemble (${ensembleSize} models)` : 'single model'}`
    );
    initPromise = sendRequest({ type: 'init', modelPaths, metadataPath });
    return initPromise;
}

/**
 * @param {Buffer} imageBuffer  PNG image
 * @param {Object} [options]
 * @param {boolean} [options.useBeamSearch=true]
 * @returns {Promise<{ text: string, confidence: number, latencyMs: number, modelVersion: string }>}
 */
async function solve(imageBuffer, options = {}) {
    stats.totalRequests++;
    try {
        await ensureInit();
        const useBeamSearch = options.useBeamSearch !== false;
        const result = await sendRequest({ type: 'infer', imageBuffer, useBeamSearch });
        stats.successes++;
        return {
            text: result.text,
            confidence: result.confidence,
            latencyMs: result.latencyMs,
            modelVersion: getModelVersion(),
        };
    } catch (err) {
        stats.failures++;
        throw err;
    }
}

function getModelVersion() {
    try {
        const { metadataPath } = getModelPaths();
        const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        return meta.version || 'unknown';
    } catch {
        return 'unknown';
    }
}

async function terminate() {
    if (child) {
        try {
            child.kill();
        } catch {
            /* ignore */
        }
        child = null;
        initPromise = null;
    }
    for (const [, p] of pending) {
        p.reject(new Error('Worker terminated'));
    }
    pending.clear();
}

module.exports = {
    isAvailable,
    solve,
    terminate,
    getStats,
    getModelVersion,
};
