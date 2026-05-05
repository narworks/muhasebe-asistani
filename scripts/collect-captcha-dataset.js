#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * GİB CAPTCHA dataset toplama scripti — Faz 0 (Local CAPTCHA plan).
 *
 *   Usage:
 *     node scripts/collect-captcha-dataset.js \
 *         --target 10000 \
 *         --out training-data/captcha/v1 \
 *         [--headful] [--limit-cost 5]
 *
 *   Flow:
 *     1. Puppeteer ile GİB login sayfasını aç
 *     2. #imgCaptcha element'ini screenshot al
 *     3. SHA256 hash hesapla, dedup et (resume edilebilir)
 *     4. Gemini 2.0 Flash ile etiketle, regex validation /^[A-Za-z0-9]{4,7}$/
 *     5. <out>/images/<hash>.png + <out>/labels.csv satırı
 *     6. page.reload() → tekrar (random 2-4s delay)
 *
 *   Resume:
 *     Mevcut labels.csv okunur, hash set'e yüklenir → aynı CAPTCHA tekrar
 *     gelirse skip. Crash olursa kaldığı yerden devam eder.
 *
 *   Maliyet (Gemini Flash):
 *     ~$0.000022 per CAPTCHA (input image + minimal output) → 10K = ~$0.22
 *     --limit-cost N USD ile cap'lenebilir, aşılırsa script durur.
 *
 *   Çıktı dosya yapısı:
 *     <out>/
 *       images/<hash>.png
 *       labels.csv      (hash,label,confidence,source,timestamp)
 *       stats.json      (final summary)
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const GIB_LOGIN_URL = 'https://dijital.gib.gov.tr/portal/login';
const CAPTCHA_VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;

// Provider'a göre yaklaşık maliyet (image-in + ~10 token text-out, low detail).
const COST_PER_CAPTCHA_USD = {
    gemini: 0.000022,         // gemini-2.0-flash
    openai: 0.000044,         // gpt-4o-mini, image_url detail=low (~84 tokens)
};

const PAGE_LOAD_TIMEOUT_MS = 60_000;
const LOGIN_FORM_SELECTOR = '#userid';
const CAPTCHA_SELECTOR = '#imgCaptcha';
const CAPTCHA_FALLBACK_SELECTOR =
    'img[alt*="captcha" i], img[class*="captcha" i], img[src*="captcha" i]';
const MIN_DELAY_MS = 2_000;
const MAX_DELAY_MS = 4_000;
const LABEL_TIMEOUT_MS = 30_000;
const STATS_INTERVAL = 100;
const VALID_PROVIDERS = ['openai', 'gemini'];

function parseArgs(argv) {
    const args = {
        target: 10_000,
        out: 'training-data/captcha/v1',
        headful: false,
        limitCost: null,
        provider: 'openai',
    };
    for (let i = 2; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--target') args.target = parseInt(argv[++i], 10);
        else if (flag === '--out') args.out = argv[++i];
        else if (flag === '--headful') args.headful = true;
        else if (flag === '--limit-cost') args.limitCost = parseFloat(argv[++i]);
        else if (flag === '--provider') args.provider = argv[++i];
        else if (flag === '--help' || flag === '-h') {
            console.log(
                'Usage: node scripts/collect-captcha-dataset.js [--target N] [--out DIR]\n' +
                    '       [--provider openai|gemini] [--headful] [--limit-cost USD]'
            );
            process.exit(0);
        }
    }
    if (!Number.isFinite(args.target) || args.target <= 0) throw new Error('Invalid --target');
    if (!VALID_PROVIDERS.includes(args.provider))
        throw new Error(`Invalid --provider (use: ${VALID_PROVIDERS.join('|')})`);
    return args;
}

function randomDelayMs() {
    return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
    ]);
}

async function loadExistingHashes(labelsCsvPath) {
    const seen = new Set();
    try {
        const stream = require('fs').createReadStream(labelsCsvPath);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        let isFirstLine = true;
        for await (const line of rl) {
            if (isFirstLine) {
                isFirstLine = false;
                continue; // header
            }
            const hash = line.split(',')[0];
            if (hash) seen.add(hash);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    return seen;
}

async function appendLabelRow(labelsCsvPath, row) {
    const line = `${row.hash},${row.label},${row.confidence ?? ''},${row.source},${row.timestamp}\n`;
    await fs.appendFile(labelsCsvPath, line, 'utf8');
}

async function ensureLabelsHeader(labelsCsvPath) {
    try {
        await fs.access(labelsCsvPath);
    } catch {
        await fs.writeFile(labelsCsvPath, 'hash,label,confidence,source,timestamp\n', 'utf8');
    }
}

const LABEL_PROMPT =
    'Bu resimdeki CAPTCHA metnini oku. Sadece metni döndür, boşluksuz. ' +
    'Karakterler büyük/küçük harf veya rakam olabilir, 4-7 karakter uzunluğunda. ' +
    'Başka hiçbir açıklama yazma.';

async function solveWithGemini(client, imageBase64) {
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await withTimeout(
        model.generateContent([
            { text: LABEL_PROMPT },
            { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ]),
        LABEL_TIMEOUT_MS,
        'Gemini labeling'
    );
    const response = await result.response;
    return response.text().trim().replace(/\s/g, '');
}

async function solveWithOpenAI(client, imageBase64) {
    const response = await withTimeout(
        client.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 20,
            temperature: 0,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: LABEL_PROMPT },
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
        LABEL_TIMEOUT_MS,
        'OpenAI labeling'
    );
    return (response.choices[0]?.message?.content || '').trim().replace(/\s/g, '');
}

async function fetchAndLabelCaptcha(page, labeler) {
    await page.goto(GIB_LOGIN_URL, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_LOAD_TIMEOUT_MS,
    });

    // GİB CAPTCHA'sı login form mount olduktan sonra async XHR ile geliyor.
    // Önce form elementini bekle, sonra CAPTCHA'yı (canonical id, ardından
    // attribute fallback'leri).
    await page.waitForSelector(LOGIN_FORM_SELECTOR, { timeout: 30_000 });

    let captchaElement = await page
        .waitForSelector(CAPTCHA_SELECTOR, { timeout: 10_000 })
        .catch(() => null);

    if (!captchaElement) {
        captchaElement = await page
            .waitForSelector(CAPTCHA_FALLBACK_SELECTOR, { timeout: 5_000 })
            .catch(() => null);
    }

    if (!captchaElement) {
        throw new Error(`CAPTCHA element bulunamadı (url=${page.url()})`);
    }

    const buffer = await captchaElement.screenshot();
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const base64 = buffer.toString('base64');

    const label = await labeler(base64);
    return { buffer, hash, label };
}

async function main() {
    const args = parseArgs(process.argv);

    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

    let labeler;
    let labelerSourceTag;
    if (args.provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY .env içinde bulunamadı');
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey });
        labeler = (img) => solveWithOpenAI(client, img);
        labelerSourceTag = 'gpt-4o-mini';
    } else {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY .env içinde bulunamadı');
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const client = new GoogleGenerativeAI(apiKey);
        labeler = (img) => solveWithGemini(client, img);
        labelerSourceTag = 'gemini-2.0-flash';
    }

    const costPerCaptcha = COST_PER_CAPTCHA_USD[args.provider];

    const outDir = path.resolve(args.out);
    const imagesDir = path.join(outDir, 'images');
    const labelsCsvPath = path.join(outDir, 'labels.csv');
    const statsPath = path.join(outDir, 'stats.json');
    await fs.mkdir(imagesDir, { recursive: true });
    await ensureLabelsHeader(labelsCsvPath);

    const seenHashes = await loadExistingHashes(labelsCsvPath);
    console.log(
        `[collect] Provider: ${args.provider} (${labelerSourceTag}) — ` +
            `Resume: ${seenHashes.size} mevcut örnek (hedef ${args.target})`
    );

    if (seenHashes.size >= args.target) {
        console.log(`[collect] Hedef zaten karşılanmış. Çıkış.`);
        return;
    }

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
        headless: !args.headful,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const stats = {
        startedAt: new Date().toISOString(),
        attempted: 0,
        saved: 0,
        duplicates: 0,
        invalidLabels: 0,
        errors: 0,
        costUsd: 0,
    };

    let shouldStop = false;
    const stop = () => {
        shouldStop = true;
        console.log('\n[collect] Sinyal alındı, mevcut iterasyon sonunda duracak…');
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    try {
        while (!shouldStop && seenHashes.size < args.target) {
            stats.attempted++;
            stats.costUsd += costPerCaptcha;

            if (args.limitCost && stats.costUsd > args.limitCost) {
                console.log(`[collect] --limit-cost ${args.limitCost} USD aşıldı, durduruluyor.`);
                break;
            }

            try {
                const { buffer, hash, label } = await fetchAndLabelCaptcha(page, labeler);

                if (seenHashes.has(hash)) {
                    stats.duplicates++;
                } else if (!CAPTCHA_VALID_REGEX.test(label)) {
                    stats.invalidLabels++;
                    console.log(`[collect] Invalid label: "${label}" (hash ${hash}), skip`);
                } else {
                    await fs.writeFile(path.join(imagesDir, `${hash}.png`), buffer);
                    await appendLabelRow(labelsCsvPath, {
                        hash,
                        label,
                        confidence: '',
                        source: labelerSourceTag,
                        timestamp: new Date().toISOString(),
                    });
                    seenHashes.add(hash);
                    stats.saved++;
                }
            } catch (err) {
                stats.errors++;
                console.error(`[collect] Iterasyon hatası: ${err.message}`);
                await new Promise((r) => setTimeout(r, 5_000));
            }

            if (stats.attempted % STATS_INTERVAL === 0) {
                console.log(
                    `[collect] attempt=${stats.attempted} saved=${stats.saved} dup=${stats.duplicates} ` +
                        `invalid=${stats.invalidLabels} err=${stats.errors} cost=$${stats.costUsd.toFixed(4)}`
                );
            }

            await new Promise((r) => setTimeout(r, randomDelayMs()));
        }
    } finally {
        await browser.close();
        stats.completedAt = new Date().toISOString();
        stats.totalSaved = seenHashes.size;
        await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf8');
        console.log(`\n[collect] Final: ${seenHashes.size}/${args.target} örnek kaydedildi`);
        console.log(`[collect] Stats: ${statsPath}`);
        console.log(`[collect] Toplam tahmini maliyet: $${stats.costUsd.toFixed(4)}`);
    }
}

main().catch((err) => {
    console.error('[collect] Fatal:', err);
    process.exit(1);
});
