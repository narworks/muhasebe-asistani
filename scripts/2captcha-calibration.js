/**
 * 2Captcha kalibrasyon testi — GİB CAPTCHA tipi için ne kadar başarılı?
 *
 * Kullanım: node scripts/2captcha-calibration.js [SAMPLE_COUNT]
 * Default: 50 örnek
 *
 * Çıktı:
 *   - Başarı oranı (%)
 *   - Ortalama yanıt süresi (sn)
 *   - Hata kırılımı
 *   - Eşleşmeyen örnekler (manual spot-check için)
 *
 * Veri kaynağı: training-data/captcha/v1/ (CRNN training set, ~20k görsel)
 * Ground truth: labels.csv'deki label (gpt-4o + relabel pass'leri ile elde edilmiş)
 *
 * Maliyet: ~$0.0005 × örnek sayısı. 50 örnek = $0.025 (~1 TL).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.TWOCAPTCHA_API_KEY;
if (!API_KEY) {
    console.error('HATA: TWOCAPTCHA_API_KEY .env dosyasında tanımlı değil');
    process.exit(1);
}

const SAMPLE_COUNT = parseInt(process.argv[2], 10) || 50;
const DATASET_DIR = path.join(__dirname, '..', 'training-data', 'captcha', 'v1');
const IMAGES_DIR = path.join(DATASET_DIR, 'images');
const LABELS_CSV = path.join(DATASET_DIR, 'labels.csv');

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 120000;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function loadLabels() {
    const csv = fs.readFileSync(LABELS_CSV, 'utf8');
    const lines = csv.trim().split('\n').slice(1);
    const map = new Map();
    for (const line of lines) {
        const [hash, label] = line.split(',');
        if (hash && label) map.set(hash, label.trim().toLowerCase());
    }
    return map;
}

function pickRandomSamples(labels, count) {
    const allHashes = Array.from(labels.keys());
    const picked = [];
    const seen = new Set();
    while (picked.length < count && seen.size < allHashes.length) {
        const idx = Math.floor(Math.random() * allHashes.length);
        const hash = allHashes[idx];
        if (seen.has(hash)) continue;
        seen.add(hash);
        const imgPath = path.join(IMAGES_DIR, `${hash}.png`);
        if (fs.existsSync(imgPath)) {
            picked.push({ hash, label: labels.get(hash), imgPath });
        }
    }
    return picked;
}

async function submitCaptcha(imgPath) {
    const base64 = fs.readFileSync(imgPath).toString('base64');
    const form = new URLSearchParams();
    form.append('key', API_KEY);
    form.append('method', 'base64');
    form.append('body', base64);
    form.append('json', '1');
    const res = await fetch('https://2captcha.com/in.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
    });
    const data = await res.json();
    if (data.status !== 1) {
        throw new Error(`submit failed: ${data.request || JSON.stringify(data)}`);
    }
    return data.request;
}

async function pollResult(captchaId) {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS);
        const url = `https://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 1) {
            return { solution: data.request, durationMs: Date.now() - start };
        }
        if (data.request !== 'CAPCHA_NOT_READY') {
            throw new Error(`poll error: ${data.request}`);
        }
    }
    throw new Error('timeout');
}

async function solveOne(sample) {
    const submitStart = Date.now();
    try {
        const id = await submitCaptcha(sample.imgPath);
        const { solution, durationMs } = await pollResult(id);
        const totalMs = Date.now() - submitStart;
        const expected = sample.label;
        const actual = (solution || '').trim().toLowerCase();
        return {
            hash: sample.hash,
            expected,
            actual,
            match: expected === actual,
            totalMs,
            solveMs: durationMs,
        };
    } catch (err) {
        return {
            hash: sample.hash,
            expected: sample.label,
            actual: null,
            match: false,
            error: err.message,
            totalMs: Date.now() - submitStart,
        };
    }
}

(async () => {
    console.log('=== 2Captcha Kalibrasyon Testi ===');
    console.log(`Örnek sayısı: ${SAMPLE_COUNT}`);
    console.log(`Tahmini maliyet: ~$${(SAMPLE_COUNT * 0.0005).toFixed(3)}\n`);

    console.log('Etiketler yükleniyor...');
    const labels = loadLabels();
    console.log(`Toplam etiketli görsel: ${labels.size}`);

    const samples = pickRandomSamples(labels, SAMPLE_COUNT);
    console.log(`Test örnekleri seçildi: ${samples.length}\n`);

    console.log("CAPTCHA'lar gönderiliyor (paralel, 5 concurrency)...\n");
    const results = [];
    const concurrency = 5;
    for (let i = 0; i < samples.length; i += concurrency) {
        const batch = samples.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(solveOne));
        results.push(...batchResults);
        const done = results.length;
        const successes = results.filter((r) => r.match).length;
        process.stdout.write(
            `\r[${done}/${samples.length}] tamamlandı, ${successes} eşleşme   `
        );
    }
    console.log('\n');

    // === Rapor ===
    const successCount = results.filter((r) => r.match).length;
    const errorCount = results.filter((r) => r.error).length;
    const mismatchCount = results.length - successCount - errorCount;
    const validDurations = results.filter((r) => r.solveMs).map((r) => r.solveMs);
    const avgMs = validDurations.length
        ? validDurations.reduce((a, b) => a + b, 0) / validDurations.length
        : 0;
    const p95Ms = validDurations.length
        ? validDurations.sort((a, b) => a - b)[Math.floor(validDurations.length * 0.95)]
        : 0;

    console.log('=== Sonuçlar ===');
    console.log(`Toplam:        ${results.length}`);
    console.log(`Eşleşen:       ${successCount} (${((successCount / results.length) * 100).toFixed(1)}%)`);
    console.log(`Eşleşmeyen:    ${mismatchCount}`);
    console.log(`Hatalı:        ${errorCount}`);
    console.log(`Ortalama süre: ${(avgMs / 1000).toFixed(1)} sn`);
    console.log(`p95 süre:      ${(p95Ms / 1000).toFixed(1)} sn`);

    if (mismatchCount > 0) {
        console.log('\n=== Eşleşmeyen örnekler (manual spot-check için) ===');
        results
            .filter((r) => !r.match && !r.error)
            .slice(0, 10)
            .forEach((r) => {
                console.log(`  ${r.hash}: beklenen="${r.expected}" / 2captcha="${r.actual}"`);
            });
    }

    if (errorCount > 0) {
        console.log('\n=== Hatalı örnekler ===');
        results
            .filter((r) => r.error)
            .slice(0, 5)
            .forEach((r) => {
                console.log(`  ${r.hash}: ${r.error}`);
            });
    }

    // JSON çıktısını dosyaya yaz (sonra analiz için)
    const outPath = path.join(__dirname, '..', '2captcha-calibration-result.json');
    fs.writeFileSync(
        outPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                sampleCount: results.length,
                successRate: successCount / results.length,
                avgSeconds: avgMs / 1000,
                p95Seconds: p95Ms / 1000,
                results,
            },
            null,
            2
        )
    );
    console.log(`\nDetaylı sonuçlar: ${outPath}`);
})();
