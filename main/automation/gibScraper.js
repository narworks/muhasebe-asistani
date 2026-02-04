const puppeteer = require('puppeteer');
const { GoogleGenAI } = require('@google/genai');
const database = require('../database');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GIB_URL = 'https://dijital.gib.gov.tr/internetVergiDairesiGiris';

const ensureLoginForm = async (page) => {
    await page.goto(GIB_URL, { waitUntil: 'networkidle0', timeout: 30000 });

    const loginInputSelector = '#kullaniciKodu';
    try {
        await page.waitForSelector(loginInputSelector, { timeout: 5000 });
        return;
    } catch {
        // Try to find and click "Giriş Yap" button
        try {
            const loginButton = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('a, button'));
                const btn = buttons.find(b => b.textContent.includes('Giriş Yap'));
                return btn ? true : false;
            });

            if (loginButton) {
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                    page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('a, button'));
                        const btn = buttons.find(b => b.textContent.includes('Giriş Yap'));
                        if (btn) btn.click();
                    })
                ]);
            }
        } catch (e) {
            console.error('Login button click failed:', e);
        }

        await page.waitForSelector(loginInputSelector, { timeout: 15000 });
    }
};

const solveCaptcha = async (page, apiKey) => {
    const captchaElement = await page.$('#imgCaptcha');
    if (!captchaElement) {
        throw new Error('Captcha elementi bulunamadı.');
    }

    const captchaBuffer = await captchaElement.screenshot();
    const captchaBase64 = captchaBuffer.toString('base64');

    const genAI = new GoogleGenAI({ apiKey });
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent([
        {
            text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.'
        },
        {
            inlineData: {
                mimeType: 'image/png',
                data: captchaBase64
            }
        }
    ]);

    const response = await result.response;
    return response.text().trim().replace(/\s/g, '');
};

const loginAndFetch = async (page, client, password, apiKey) => {
    await page.type('#kullaniciKodu', client.gib_user_code);
    await page.type('#sifre', password);

    const captchaCode = await solveCaptcha(page, apiKey);
    await page.type('#dk', captchaCode);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        page.click('#giris')
    ]);

    const errorElement = await page.$('#msgError');
    if (errorElement) {
        const errorText = await page.evaluate(el => el.textContent, errorElement);
        if (errorText && errorText.trim().length > 0) {
            throw new Error(errorText.trim());
        }
    }

    // Find and click E-Tebligat link
    const eTebligatLinkExists = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => a.textContent.includes('E-Tebligat'));
        return link ? true : false;
    });

    if (eTebligatLinkExists) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }),
            page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const link = links.find(a => a.textContent.includes('E-Tebligat'));
                if (link) link.click();
            })
        ]);
    }

    const tableSelector = 'table tbody tr';
    try {
        await page.waitForSelector(tableSelector, { timeout: 10000 });
    } catch {
        return [];
    }

    return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length < 4) return null;
            return {
                date: cols[0]?.innerText?.trim(),
                sender: cols[1]?.innerText?.trim(),
                subject: cols[2]?.innerText?.trim(),
                status: cols[3]?.innerText?.trim()
            };
        }).filter(Boolean);
    });
};

async function run(onStatusUpdate, apiKey) {
    const clients = database.getClients();

    if (clients.length === 0) {
        onStatusUpdate({ message: 'Tanımlı mükellef bulunamadı.', type: 'info' });
        return;
    }

    if (!apiKey) {
        onStatusUpdate({ message: 'API anahtarı bulunamadı. Lütfen API anahtarınızı girin.', type: 'error' });
        return;
    }

    onStatusUpdate({ message: `${clients.length} mükellef için tarama başlatılıyor...`, type: 'info' });

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        for (const client of clients) {
            if (client.status !== 'active') continue;

            const password = database.getClientPassword(client.id);
            if (!password) {
                onStatusUpdate({ message: `${client.firm_name}: Şifre çözülemedi veya yok.`, type: 'error', firmId: client.id });
                continue;
            }

            onStatusUpdate({ message: `${client.firm_name} sorgulanıyor...`, type: 'process', firmId: client.id });

            let page;
            try {
                page = await browser.newPage();
                await page.setUserAgent(USER_AGENT);
                await page.setViewport({ width: 1280, height: 800 });

                await ensureLoginForm(page);

                const tebligatlar = await loginAndFetch(page, client, password, apiKey);
                const count = tebligatlar.length;
                const savedCount = database.saveTebligatlar(client.id, tebligatlar);
                onStatusUpdate({
                    message: `${client.firm_name}: ${count} tebligat bulundu, ${savedCount} yeni kayıt eklendi.`,
                    type: 'success',
                    firmId: client.id
                });
            } catch (err) {
                console.error(`Error processing ${client.firm_name}:`, err);
                onStatusUpdate({ message: `${client.firm_name}: Hata - ${err.message}`, type: 'error', firmId: client.id });
            } finally {
                if (page) await page.close();
            }
        }
    } catch (error) {
        onStatusUpdate({ message: `Genel Hata: ${error.message}`, type: 'error' });
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = {
    run
};
