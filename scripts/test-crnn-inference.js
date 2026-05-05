/* eslint-disable no-console */
/**
 * CRNN inference standalone test — Electron context'i olmadan ONNX modelini
 * doğrudan çalıştırır. Model + onnxruntime + sharp + CTC decode pipeline'ını
 * test eder.
 *
 * Usage:
 *   node scripts/test-crnn-inference.js
 *
 * Çıktı: ilk 20 image için tahmin + confidence + latency.
 * Karşılaştırma için labels.csv'den gerçek label da gösterilir.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function loadLabels(csvPath) {
    const map = new Map();
    const stream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let isFirst = true;
    for await (const line of rl) {
        if (isFirst) {
            isFirst = false;
            continue;
        }
        const [hash, label] = line.split(',');
        if (hash && label) map.set(hash, label);
    }
    return map;
}

async function main() {
    const worker = require('../main/automation/captchaInferenceWorker');

    const modelPath = path.resolve(
        __dirname,
        '..',
        'main/automation/models/captcha-v1.int8.onnx'
    );
    const metadataPath = path.resolve(
        __dirname,
        '..',
        'main/automation/models/captcha-v1.metadata.json'
    );
    const datasetRoot = path.resolve(__dirname, '..', 'training-data/captcha/v1');

    if (!fs.existsSync(modelPath)) {
        console.error(`Model bulunamadı: ${modelPath}`);
        process.exit(1);
    }

    console.log('[test] Model yükleniyor...');
    const t0 = Date.now();
    await worker.init(modelPath, metadataPath);
    console.log(`[test] Model yüklendi (${Date.now() - t0}ms)`);

    const labels = await loadLabels(path.join(datasetRoot, 'labels.csv'));
    const imagesDir = path.join(datasetRoot, 'images');

    // İlk 20 image (deterministic) + greedy & beam karşılaştırma
    const files = fs.readdirSync(imagesDir).sort().slice(0, 20);

    let correctGreedy = 0;
    let correctBeam = 0;
    let totalLatency = 0;

    const pad = (s, n) => String(s).padEnd(n);
    console.log(
        '\n' +
            pad('hash', 18) +
            ' | ' +
            pad('truth', 8) +
            ' | ' +
            pad('greedy', 8) +
            ' | ' +
            pad('beam', 8) +
            ' | ' +
            pad('conf', 6) +
            ' | lat'
    );
    console.log('-'.repeat(70));

    for (const f of files) {
        const hash = f.replace('.png', '');
        const buf = fs.readFileSync(path.join(imagesDir, f));
        const truth = labels.get(hash) || '?';

        const beam = await worker.infer(buf, true);
        const greedy = await worker.infer(buf, false);

        const okG = greedy.text === truth;
        const okB = beam.text === truth;
        if (okG) correctGreedy++;
        if (okB) correctBeam++;
        totalLatency += beam.latencyMs;

        const tag = okB ? '✓' : okG ? '~' : '✗';
        console.log(
            pad(hash.slice(0, 16), 18) +
                ' | ' +
                pad(truth, 8) +
                ' | ' +
                pad(greedy.text || '(empty)', 8) +
                ' | ' +
                pad(beam.text || '(empty)', 8) +
                ' | ' +
                pad(beam.confidence.toFixed(3), 6) +
                ' | ' +
                beam.latencyMs +
                'ms ' +
                tag
        );
    }

    console.log('-'.repeat(70));
    console.log(
        `\n[test] Sonuç: greedy=${correctGreedy}/20 (${(correctGreedy / 20 * 100).toFixed(1)}%) | ` +
            `beam=${correctBeam}/20 (${(correctBeam / 20 * 100).toFixed(1)}%) | ` +
            `avg latency=${Math.round(totalLatency / 20)}ms`
    );
    console.log(`[test] Beam search +${correctBeam - correctGreedy} kazanım`);
}

main().catch((err) => {
    console.error('[test] Fatal:', err);
    process.exit(1);
});
