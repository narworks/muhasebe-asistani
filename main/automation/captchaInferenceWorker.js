/* eslint-disable no-console */
/**
 * CRNN CAPTCHA Inference Worker — UtilityProcess child.
 *
 * Main process'i bloklamamak için ONNX inference izole bir Node child'ında
 * koşar. Parent process captchaCRNN.js üzerinden request gönderir, biz
 * burada model load + image preprocess + inference + CTC decode yaparız.
 *
 * Protokol (parent ↔ child):
 *   parent → child: { type: 'init', requestId, modelPath, metadataPath }
 *   child  → parent: { type: 'ready', requestId }   |   { type: 'error', requestId, error }
 *
 *   parent → child: { type: 'infer', requestId, imageBuffer, useBeamSearch }
 *   child  → parent: { type: 'result', requestId, text, confidence, latencyMs }
 *                  | { type: 'error', requestId, error }
 *
 * CTC decoding: greedy (default) veya beam search (beam_width=10). Beam
 * search +%2-5 accuracy verir, latency'yi 5-10ms artırır (CAPTCHA için
 * önemsiz).
 */

const fs = require('fs');
const path = require('path');

// Ensemble: birden fazla session paralel çalışır, logit averaging ile birleşir.
// Tek model için array uzunluğu 1 — backwards compatible.
let sessions = [];
let charset = '';
let blankIdx = 0;
let inputHeight = 32;
let inputMaxWidth = 160;

// ---------- Init ----------
/**
 * @param {string|string[]} modelPaths   Tek string veya ensemble için array
 * @param {string} metadataPath          Tek metadata (tüm modeller aynı arch'e sahip)
 */
async function init(modelPaths, metadataPath) {
    const ort = require('onnxruntime-node');
    const paths = Array.isArray(modelPaths) ? modelPaths : [modelPaths];
    sessions = await Promise.all(
        paths.map((p) =>
            ort.InferenceSession.create(p, {
                executionProviders: ['cpu'],
                graphOptimizationLevel: 'all',
            })
        )
    );
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    charset = meta.charset;
    blankIdx = meta.blank_idx ?? 0;
    if (Array.isArray(meta.input_shape) && meta.input_shape.length === 4) {
        inputHeight = meta.input_shape[2];
        inputMaxWidth = meta.input_shape[3];
    }
}

// ---------- Preprocess ----------
async function preprocess(imageBuffer) {
    const sharp = require('sharp');
    const ort = require('onnxruntime-node');

    const baseImg = sharp(imageBuffer).grayscale();
    const md = await baseImg.metadata();
    if (!md.width || !md.height) throw new Error('Image has no dimensions');

    let newW = Math.round((md.width * inputHeight) / md.height);
    newW = Math.min(inputMaxWidth, Math.max(32, newW));

    const resized = await baseImg
        .resize({ height: inputHeight, width: newW, fit: 'fill' })
        .raw()
        .toBuffer();

    // Tensor (1, 1, H, MAX_WIDTH) — kalan W beyaz (255) ile dolduruldu, sonra
    // [-1, 1] aralığına normalize edildi (training pipeline ile uyumlu).
    const tensor = new Float32Array(1 * 1 * inputHeight * inputMaxWidth);
    for (let h = 0; h < inputHeight; h++) {
        for (let w = 0; w < inputMaxWidth; w++) {
            const dstIdx = h * inputMaxWidth + w;
            const raw = w < newW ? resized[h * newW + w] : 255;
            const norm = raw / 255.0;
            tensor[dstIdx] = (norm - 0.5) / 0.5;
        }
    }
    return new ort.Tensor('float32', tensor, [1, 1, inputHeight, inputMaxWidth]);
}

// ---------- CTC decoding ----------
function ctcGreedyDecode(logProbs, T, C) {
    let prev = blankIdx;
    let out = '';
    for (let t = 0; t < T; t++) {
        let maxIdx = 0;
        let maxVal = -Infinity;
        const base = t * C;
        for (let c = 0; c < C; c++) {
            const v = logProbs[base + c];
            if (v > maxVal) {
                maxVal = v;
                maxIdx = c;
            }
        }
        if (maxIdx !== blankIdx && maxIdx !== prev) {
            out += charset[maxIdx - 1] ?? '';
        }
        prev = maxIdx;
    }
    return out;
}

function logSumExp(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    const m = Math.max(a, b);
    return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

/**
 * Standart CTC prefix beam search.
 *   - blank ve non-blank prefix probability ayrı tracked
 *   - karakter repeat blank arasında olmalı (CTC kuralı)
 *   - beam_width=10 (5-15 arası tatlı nokta)
 * +%2-5 accuracy, ~5-10ms ek latency.
 */
function ctcBeamSearchDecode(logProbs, T, C, beamWidth = 10) {
    // Beams: Map<seqString, { blankProb, nonBlankProb }>
    let beams = new Map();
    beams.set('', { blankProb: 0, nonBlankProb: -Infinity });

    for (let t = 0; t < T; t++) {
        const next = new Map();
        const ensure = (seq) => {
            let b = next.get(seq);
            if (!b) {
                b = { blankProb: -Infinity, nonBlankProb: -Infinity };
                next.set(seq, b);
            }
            return b;
        };
        const base = t * C;
        for (const [seq, beam] of beams) {
            const total = logSumExp(beam.blankProb, beam.nonBlankProb);
            const lastChar = seq.length > 0 ? seq[seq.length - 1] : null;

            // Blank token — sequence aynı, blank prob güncellenir
            const blankP = logProbs[base + blankIdx];
            const cur = ensure(seq);
            cur.blankProb = logSumExp(cur.blankProb, total + blankP);

            // Karakter token'ları
            for (let c = 0; c < C; c++) {
                if (c === blankIdx) continue;
                const ch = charset[c - 1];
                if (!ch) continue;
                const p = logProbs[base + c];

                if (ch === lastChar) {
                    // Aynı karakter — sequence aynı (non-blank'tan repeat blocked CTC)
                    const same = ensure(seq);
                    same.nonBlankProb = logSumExp(same.nonBlankProb, beam.nonBlankProb + p);
                    // Yeni sequence (blank'tan sonra repeat'a izin var)
                    const newSeq = seq + ch;
                    const nb = ensure(newSeq);
                    nb.nonBlankProb = logSumExp(nb.nonBlankProb, beam.blankProb + p);
                } else {
                    const newSeq = seq + ch;
                    const nb = ensure(newSeq);
                    nb.nonBlankProb = logSumExp(nb.nonBlankProb, total + p);
                }
            }
        }
        // Top-K beams (toplam prob)
        const ranked = Array.from(next.entries())
            .map(([s, b]) => [s, b, logSumExp(b.blankProb, b.nonBlankProb)])
            .sort((a, b) => b[2] - a[2])
            .slice(0, beamWidth);
        beams = new Map(ranked.map(([s, b]) => [s, b]));
    }

    let best = '';
    let bestScore = -Infinity;
    for (const [seq, b] of beams) {
        const tot = logSumExp(b.blankProb, b.nonBlankProb);
        if (tot > bestScore) {
            bestScore = tot;
            best = seq;
        }
    }
    return best;
}

/**
 * Raw logits → log_softmax dönüşümü (in-place, T*C float32).
 *
 * NOT: PyTorch model'i forward'da F.log_softmax UYGULAMIYOR — train.py
 * loss hesabından önce manuel uygulanıyordu. ONNX export modelden çıkan
 * tensor "logits" (negatif sınırlı değil, +20 olabilir). CTC beam search
 * + confidence hesabı için log_probs gerek → bu fonksiyon dönüştürür.
 */
function logSoftmaxInplace(arr, T, C) {
    for (let t = 0; t < T; t++) {
        const base = t * C;
        // numerik stabilite için max çıkar
        let maxV = -Infinity;
        for (let c = 0; c < C; c++) {
            const v = arr[base + c];
            if (v > maxV) maxV = v;
        }
        let sumExp = 0;
        for (let c = 0; c < C; c++) {
            sumExp += Math.exp(arr[base + c] - maxV);
        }
        const lse = maxV + Math.log(sumExp);
        for (let c = 0; c < C; c++) {
            arr[base + c] = arr[base + c] - lse;
        }
    }
}

// ---------- Inference ----------
async function infer(imageBuffer, useBeamSearch) {
    if (!sessions.length) throw new Error('Sessions not initialized');
    const t0 = Date.now();

    const tensor = await preprocess(imageBuffer);

    // Sıralı inference — paralel Promise.all ONNX session'lar arasında tensor
    // race condition'a sebep oluyordu (calibration testinde %0 accuracy).
    // Her model için ayrı log_softmax sonra averaging — geometric mean of
    // softmax probabilities (theoretically correct ensemble).
    let T = 0;
    let C = 0;
    const allLogProbs = [];
    for (const session of sessions) {
        const out = await session.run({ image: tensor });
        if (!out.log_probs) throw new Error('Output "log_probs" missing');
        if (T === 0) {
            T = out.log_probs.dims[0];
            C = out.log_probs.dims[2];
        }
        // Immediate copy + log_softmax (her model'in raw logits'ini bağımsız normalize)
        const lp = new Float32Array(out.log_probs.data);
        logSoftmaxInplace(lp, T, C);
        allLogProbs.push(lp);
    }

    // Log_probs averaging — log domain'de toplam (= softmax product → geometric mean)
    const data = new Float32Array(T * C);
    for (const lp of allLogProbs) {
        for (let i = 0; i < data.length; i++) data[i] += lp[i];
    }
    const N = sessions.length;
    for (let i = 0; i < data.length; i++) data[i] /= N;

    // NOT: artık logSoftmaxInplace çağrısına gerek yok — data zaten averaged log_probs.

    // Confidence: SEQUENCE MIN — non-blank karakter prediction'larının en düşük
    // softmax probability'si. Ortalama "average" overconfidence sorununu maskeler;
    // tek bir karakter düşük güvenli ise tüm CAPTCHA güvensiz sayılmalı.
    // Calibration analizinde average yöntem hibrit'i %95.2'ye sıkıştırıyordu →
    // min yöntemi doğru/yanlış separation'ı belirginleştirir.
    let minConf = 1.0;
    let nonBlankCount = 0;
    for (let t = 0; t < T; t++) {
        let maxV = -Infinity;
        let argmax = 0;
        const b = t * C;
        for (let c = 0; c < C; c++) {
            const v = data[b + c];
            if (v > maxV) {
                maxV = v;
                argmax = c;
            }
        }
        if (argmax !== blankIdx) {
            const p = Math.exp(maxV);
            if (p < minConf) minConf = p;
            nonBlankCount++;
        }
    }
    // Eğer tüm timestep blank ise (boş prediction) güven 0
    const confidence = nonBlankCount > 0 ? minConf : 0;

    const text = useBeamSearch ? ctcBeamSearchDecode(data, T, C, 10) : ctcGreedyDecode(data, T, C);

    return { text, confidence, latencyMs: Date.now() - t0 };
}

// ---------- IPC ----------
if (process.parentPort) {
    process.parentPort.on('message', async (e) => {
        const data = e.data || e;
        const { type, requestId } = data;
        try {
            if (type === 'init') {
                // modelPaths (array, ensemble) veya modelPath (string, single) — ikisi de kabul
                await init(data.modelPaths || data.modelPath, data.metadataPath);
                process.parentPort.postMessage({ type: 'ready', requestId });
            } else if (type === 'infer') {
                const result = await infer(data.imageBuffer, data.useBeamSearch ?? true);
                process.parentPort.postMessage({ type: 'result', requestId, ...result });
            } else {
                process.parentPort.postMessage({
                    type: 'error',
                    requestId,
                    error: `Unknown message type: ${type}`,
                });
            }
        } catch (err) {
            process.parentPort.postMessage({
                type: 'error',
                requestId,
                error: err.message || String(err),
            });
        }
    });
}

module.exports = { init, infer }; // standalone testing için
