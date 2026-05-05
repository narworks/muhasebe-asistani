/* eslint-disable no-console */
// gpt-4o invalid-only debug — random 100 image, sadece regex'ten geçmeyen output'ları log
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const OpenAI = require('openai');
const VALID_REGEX = /^[A-Za-z0-9]{4,7}$/;

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY .env içinde yok');

    const client = new OpenAI({ apiKey });
    const imagesDir = path.resolve(__dirname, '..', 'training-data/captcha/v1/images');
    const allFiles = fs.readdirSync(imagesDir);
    // Random 100
    const shuffled = allFiles.sort(() => Math.random() - 0.5).slice(0, 100);

    const prompt =
        'Bu resimdeki CAPTCHA metnini oku. Sadece metni döndür, boşluksuz. ' +
        'Karakterler büyük/küçük harf veya rakam olabilir, 4-7 karakter uzunluğunda. ' +
        'Başka hiçbir açıklama yazma.';

    let valid = 0;
    let invalid = 0;
    const invalidExamples = [];

    for (let i = 0; i < shuffled.length; i++) {
        const f = shuffled[i];
        try {
            const buf = fs.readFileSync(path.join(imagesDir, f));
            const b64 = buf.toString('base64');
            const r = await client.chat.completions.create({
                model: 'gpt-4o',
                max_tokens: 20,
                temperature: 0,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/png;base64,${b64}`,
                                    detail: 'low',
                                },
                            },
                        ],
                    },
                ],
            });
            const raw = r.choices[0].message.content || '';
            const cleaned = raw.trim().replace(/\s/g, '');
            if (VALID_REGEX.test(cleaned)) {
                valid++;
            } else {
                invalid++;
                invalidExamples.push({ file: f, raw: JSON.stringify(raw), cleaned });
            }
        } catch (err) {
            console.error(`[err] ${f}: ${err.message}`);
        }
        if ((i + 1) % 20 === 0) {
            console.log(`Progress: ${i + 1}/100 valid=${valid} invalid=${invalid}`);
        }
        // Rate limit'e takılmamak için minik delay
        await new Promise((r) => setTimeout(r, 200));
    }

    console.log(`\nFINAL: valid=${valid} invalid=${invalid} (%${((invalid / 100) * 100).toFixed(0)})`);
    console.log('\n--- INVALID OUTPUTS ---');
    for (const ex of invalidExamples.slice(0, 30)) {
        console.log(`${ex.file} → raw=${ex.raw} cleaned=${JSON.stringify(ex.cleaned)} (len=${ex.cleaned.length})`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
