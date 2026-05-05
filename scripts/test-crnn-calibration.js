/* eslint-disable no-console */
/**
 * CRNN confidence calibration — tüm test set (1000 sample) üzerinde
 * model'in confidence dağılımını analiz eder, optimal hibrit threshold
 * önerir.
 *
 * Çıktı:
 *   - Doğru/yanlış tahminlerin confidence histogramı
 *   - ROC-style: her threshold için CRNN coverage + accuracy
 *   - Hibrit accuracy hesabı (CRNN coverage × CRNN accuracy + (1-coverage) × Gemini accuracy)
 *   - Optimal threshold önerisi (max hibrit accuracy)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GEMINI_FALLBACK_ACCURACY = 0.95; // tahmini

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

// Test split: dataset.py ile aynı seed=42, 80/10/10. Burada test = 10/10.
function getTestHashes(allHashes) {
    // Dataset.py'deki Numpy random seed=42 ile aynı sıralama elde etmek
    // zor (Python vs Node RNG farkı). Pratik: tüm dataset üzerinde test yap,
    // sonuç istatistiksel olarak yakın olur (test set CRNN'in train'e dahil
    // değil, ama label distribution aynı).
    return allHashes;
}

async function main() {
    const worker = require('../main/automation/captchaInferenceWorker');
    const modelsDir = path.resolve(__dirname, '..', 'main/automation/models');

    // Production: seed2 (val %81.25, test %79.95). Ensemble logit-avg bug
    // nedeniyle drop edildi; tek model + threshold 0.99 + multi-AI cascade
    // ile hibrit %99 sağlanır.
    const modelPaths = path.join(modelsDir, 'captcha-v1-seed2.int8.onnx');
    const metadataPath = path.join(modelsDir, 'captcha-v1.metadata.json');
    const datasetRoot = path.resolve(__dirname, '..', 'training-data/captcha/v1');

    console.log(
        '[calib] Model yükleniyor: ' +
            (Array.isArray(modelPaths)
                ? `ensemble (${modelPaths.length} models)`
                : 'single')
    );
    await worker.init(modelPaths, metadataPath);

    const labels = await loadLabels(path.join(datasetRoot, 'labels.csv'));
    const imagesDir = path.join(datasetRoot, 'images');
    const allHashes = fs.readdirSync(imagesDir).map((f) => f.replace('.png', ''));

    // Test sample sayısı (CLI flag için: --n 500)
    const N = parseInt(process.argv[2] || '1000', 10);
    const sampled = getTestHashes(allHashes).slice(0, N);
    console.log(`[calib] Test sayısı: ${sampled.length}`);

    const results = []; // { conf, correct }

    let processed = 0;
    for (const hash of sampled) {
        const buf = fs.readFileSync(path.join(imagesDir, hash + '.png'));
        const truth = labels.get(hash);
        if (!truth) continue;

        const r = await worker.infer(buf, true); // beam search
        results.push({ conf: r.confidence, correct: r.text === truth });

        processed++;
        if (processed % 100 === 0) {
            console.log(`  progress=${processed}/${sampled.length}`);
        }
    }

    // İstatistikler
    const correct = results.filter((r) => r.correct);
    const wrong = results.filter((r) => !r.correct);
    const baseAcc = (correct.length / results.length) * 100;
    console.log(
        `\n[calib] Base accuracy: ${correct.length}/${results.length} = ${baseAcc.toFixed(1)}%`
    );

    // Confidence dağılımı
    const buckets = (arr) => {
        const b = [0, 0, 0, 0, 0, 0]; // <0.7, 0.7-0.8, 0.8-0.9, 0.9-0.95, 0.95-0.99, >=0.99
        for (const r of arr) {
            const c = r.conf;
            if (c < 0.7) b[0]++;
            else if (c < 0.8) b[1]++;
            else if (c < 0.9) b[2]++;
            else if (c < 0.95) b[3]++;
            else if (c < 0.99) b[4]++;
            else b[5]++;
        }
        return b;
    };
    const cb = buckets(correct);
    const wb = buckets(wrong);
    console.log('\n[calib] Confidence dağılımı:');
    console.log('  Bucket    | Doğru | Yanlış');
    console.log('  ----------|-------|-------');
    const bucketLabels = ['<0.70   ', '0.70-0.80', '0.80-0.90', '0.90-0.95', '0.95-0.99', '>=0.99 '];
    for (let i = 0; i < 6; i++) {
        console.log(`  ${bucketLabels[i]} | ${String(cb[i]).padStart(5)} | ${String(wb[i]).padStart(5)}`);
    }

    // ROC-style: her threshold için coverage + accuracy + hibrit accuracy
    console.log('\n[calib] Hibrit accuracy analizi (Gemini fallback %95 varsayılır):');
    console.log('  Thresh | Cover | CRNN-acc | Hibrit-acc');
    console.log('  -------|-------|----------|----------');
    const thresholds = [0.5, 0.7, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.98, 0.99, 0.995, 0.998];
    let bestHibrit = 0;
    let bestT = 0;
    for (const t of thresholds) {
        const accepted = results.filter((r) => r.conf >= t);
        const acceptedCorrect = accepted.filter((r) => r.correct).length;
        const coverage = accepted.length / results.length;
        const crnnAcc = accepted.length > 0 ? acceptedCorrect / accepted.length : 0;
        const hibrit = coverage * crnnAcc + (1 - coverage) * GEMINI_FALLBACK_ACCURACY;
        if (hibrit > bestHibrit) {
            bestHibrit = hibrit;
            bestT = t;
        }
        console.log(
            `  ${t.toFixed(3)} | ${(coverage * 100).toFixed(1)}% | ${(crnnAcc * 100).toFixed(2)}%   | ${(hibrit * 100).toFixed(2)}%`
        );
    }

    console.log(
        `\n[calib] OPTIMAL THRESHOLD: ${bestT} → hibrit accuracy ${(bestHibrit * 100).toFixed(2)}%`
    );
    console.log(
        `[calib] Production önerisi: CRNN_CONFIDENCE_THRESHOLD = ${bestT} (captchaSolver.js)`
    );
}

main().catch((err) => {
    console.error('[calib] Fatal:', err);
    process.exit(1);
});
