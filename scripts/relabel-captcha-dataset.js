#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * GİB CAPTCHA dataset re-labeling — mevcut images/<hash>.png'leri
 * GPT-4o (full) ile yeniden etiketle.
 *
 *   Usage:
 *     node scripts/relabel-captcha-dataset.js \
 *         --in training-data/captcha/v1 \
 *         [--model gpt-4o] [--concurrency 10] [--limit-cost 5]
 *
 *   Akış:
 *     1. Mevcut labels.csv okur, hash → old_label map kurar
 *     2. images/ klasöründeki tüm PNG'leri al
 *     3. Concurrency pool (default 10) ile GPT-4o'ya gönder, etiketle
 *     4. Validation: regex /^[A-Za-z0-9]{4,7}$/
 *     5. Yeni labels'ları labels.csv.new'a yaz (resume desteği)
 *     6. Bitince labels.csv → labels.csv.<old-source>.bak, labels.csv.new → labels.csv
 *     7. Diff raporu: kaç label değişti
 *
 *   Maliyet (GPT-4o low detail, image-in + ~10 token out):
 *     ~$0.000128 per image → 10K = ~$1.28
 *     mini'den 3x pahalı ama %95+ doğruluk (mini ~%85-90 noise oranı)
 *
 *   Re-label motivasyonu: CRNN val_exact %75 plateau yapıyor → dataset
 *   labels'ında noise var (mini bazı CAPTCHA'ları yanlış okumuş). Doğru
 *   labels ile retrain → CRNN gerçek tavanına ulaşır (%85-92 beklenir).
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const readline = require('readline');

const CAPTCHA_VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;
const COST_PER_CAPTCHA_USD = 0.000128; // gpt-4o, image_url detail=low
const LABEL_TIMEOUT_MS = 30_000;
const STATS_INTERVAL = 100;

const LABEL_PROMPT =
    'Bu resimdeki CAPTCHA metnini oku. Sadece metni döndür, boşluksuz. ' +
    'Karakterler büyük/küçük harf veya rakam olabilir, 4-7 karakter uzunluğunda. ' +
    'Başka hiçbir açıklama yazma.';

function parseArgs(argv) {
    const args = {
        in: 'training-data/captcha/v1',
        model: 'gpt-4o',
        concurrency: 10,
        limitCost: null,
    };
    for (let i = 2; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--in') args.in = argv[++i];
        else if (flag === '--model') args.model = argv[++i];
        else if (flag === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
        else if (flag === '--limit-cost') args.limitCost = parseFloat(argv[++i]);
        else if (flag === '--help' || flag === '-h') {
            console.log(
                'Usage: node scripts/relabel-captcha-dataset.js [--in DIR] [--model gpt-4o]\n' +
                    '       [--concurrency 10] [--limit-cost USD]'
            );
            process.exit(0);
        }
    }
    return args;
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
        ),
    ]);
}

async function loadLabelsCsv(csvPath) {
    const map = new Map();
    try {
        const stream = fsSync.createReadStream(csvPath);
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
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    return map;
}

async function solveWithOpenAI(client, model, imageBase64, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await withTimeout(
                client.chat.completions.create({
                    model,
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
                'OpenAI relabel'
            );
            return (response.choices[0]?.message?.content || '').trim().replace(/\s/g, '');
        } catch (err) {
            const isRateLimit = err.status === 429;
            const isServerError = err.status >= 500;
            if ((isRateLimit || isServerError) && attempt < maxRetries) {
                // OpenAI 'retry-after' header'ı saniye cinsinden döner; yoksa exponential backoff
                const retryAfter = err.headers?.['retry-after']
                    ? parseFloat(err.headers['retry-after'])
                    : null;
                const waitSec = retryAfter || Math.min(60, Math.pow(2, attempt));
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }
            throw err;
        }
    }
    throw new Error('OpenAI maxRetries exhausted');
}

async function runWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIdx = 0;
    const workers = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push(
            (async () => {
                while (true) {
                    const myIdx = nextIdx++;
                    if (myIdx >= items.length) break;
                    try {
                        results[myIdx] = await worker(items[myIdx], myIdx);
                    } catch (err) {
                        results[myIdx] = { error: err.message };
                    }
                }
            })()
        );
    }
    await Promise.all(workers);
    return results;
}

async function main() {
    const args = parseArgs(process.argv);

    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY .env içinde bulunamadı');

    const inDir = path.resolve(args.in);
    const imagesDir = path.join(inDir, 'images');
    const oldCsvPath = path.join(inDir, 'labels.csv');
    const newCsvPath = path.join(inDir, 'labels.csv.new');
    const backupPath = path.join(inDir, `labels.csv.gpt-4o-mini.bak`);

    // Mevcut labels (eski mini etiketleri)
    const oldLabels = await loadLabelsCsv(oldCsvPath);
    if (oldLabels.size === 0) {
        throw new Error('Eski labels.csv boş veya bulunamadı');
    }

    // Resume: labels.csv.new mevcut hash'ler skip edilir
    const newLabels = await loadLabelsCsv(newCsvPath);
    console.log(
        `[relabel] Eski label sayısı: ${oldLabels.size} | Resume: ${newLabels.size} mevcut yeni label`
    );

    // Hangi hash'leri re-label edeceğiz
    const hashes = Array.from(oldLabels.keys()).filter((h) => !newLabels.has(h));
    console.log(`[relabel] Re-label edilecek: ${hashes.length} | Model: ${args.model}`);

    if (hashes.length === 0) {
        console.log('[relabel] Tüm label\'lar zaten yeni — finalize ediyorum');
    } else {
        // Başlık satırı (yeni dosya yoksa)
        try {
            await fs.access(newCsvPath);
        } catch {
            await fs.writeFile(newCsvPath, 'hash,label,confidence,source,timestamp\n', 'utf8');
        }

        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey });

        const stats = {
            startedAt: new Date().toISOString(),
            attempted: 0,
            saved: 0,
            invalidLabels: 0,
            fallbackToOld: 0,
            errors: 0,
            costUsd: 0,
        };

        let shouldStop = false;
        const stop = () => {
            shouldStop = true;
            console.log('\n[relabel] Sinyal alındı, mevcut iterasyon sonunda duracak…');
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);

        let processedCount = 0;

        await runWithConcurrency(hashes, args.concurrency, async (hash) => {
            if (shouldStop) return;
            if (args.limitCost && stats.costUsd > args.limitCost) {
                shouldStop = true;
                return;
            }

            stats.attempted++;
            stats.costUsd += COST_PER_CAPTCHA_USD;

            const imagePath = path.join(imagesDir, `${hash}.png`);
            try {
                const buffer = await fs.readFile(imagePath);
                const base64 = buffer.toString('base64');
                const label = await solveWithOpenAI(client, args.model, base64);

                if (!CAPTCHA_VALID_REGEX.test(label)) {
                    stats.invalidLabels++;
                    // gpt-4o güvenlik refusal verdi ("Üzgünüm, yorumlayamam") veya
                    // başka format hatası. Eski mini label'ına fallback — dataset
                    // bütünlüğü korundu, mini'nin %22 noise'u sadece bu %5 üzerinde
                    // → total noise ~%1.1
                    const oldLabel = oldLabels.get(hash);
                    if (oldLabel && CAPTCHA_VALID_REGEX.test(oldLabel)) {
                        const line = `${hash},${oldLabel},,gpt-4o-mini-fallback,${new Date().toISOString()}\n`;
                        await fs.appendFile(newCsvPath, line, 'utf8');
                        stats.fallbackToOld++;
                    }
                } else {
                    const line = `${hash},${label},,${args.model},${new Date().toISOString()}\n`;
                    await fs.appendFile(newCsvPath, line, 'utf8');
                    stats.saved++;
                }
            } catch (err) {
                stats.errors++;
                if (stats.errors < 5) {
                    console.error(`[relabel] Hata (${hash}): ${err.message}`);
                }
            }

            processedCount++;
            if (processedCount % STATS_INTERVAL === 0) {
                console.log(
                    `[relabel] processed=${processedCount}/${hashes.length} ` +
                        `saved=${stats.saved} fallback=${stats.fallbackToOld} ` +
                        `invalid=${stats.invalidLabels} err=${stats.errors} ` +
                        `cost=$${stats.costUsd.toFixed(4)}`
                );
            }
        });

        console.log(
            `[relabel] Re-label tamamlandı: saved=${stats.saved} fallback=${stats.fallbackToOld} ` +
                `invalid=${stats.invalidLabels} err=${stats.errors} cost=$${stats.costUsd.toFixed(4)}`
        );
    }

    // Diff: kaç label değişti?
    const finalNewLabels = await loadLabelsCsv(newCsvPath);
    let unchanged = 0;
    let changed = 0;
    let missing = 0;
    for (const [hash, oldLabel] of oldLabels) {
        const newLabel = finalNewLabels.get(hash);
        if (newLabel === undefined) missing++;
        else if (newLabel === oldLabel) unchanged++;
        else changed++;
    }
    console.log(
        `\n[relabel] DIFF — unchanged=${unchanged} changed=${changed} missing=${missing} ` +
            `(toplam ${oldLabels.size})`
    );
    console.log(
        `[relabel] Noise estimate (gpt-4o-mini'nin yanlış oranı): ` +
            `${((changed / (changed + unchanged)) * 100).toFixed(1)}%`
    );

    // Finalize: backup eski + new'i adlandır
    if (missing === 0) {
        try {
            await fs.rename(oldCsvPath, backupPath);
            await fs.rename(newCsvPath, oldCsvPath);
            console.log(
                `\n[relabel] ✓ labels.csv güncellendi (backup: ${path.basename(backupPath)})`
            );
        } catch (err) {
            console.error(`[relabel] Rename hatası: ${err.message}`);
        }
    } else {
        console.log(
            `\n[relabel] ⚠ ${missing} label eksik — script'i tekrar çalıştır resume eder. ` +
                `Tamamlanınca finalize otomatik yapılır.`
        );
    }
}

main().catch((err) => {
    console.error('[relabel] Fatal:', err);
    process.exit(1);
});
