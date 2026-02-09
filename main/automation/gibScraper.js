const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const database = require('../database');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GIB_LOGIN_URL = 'https://dijital.gib.gov.tr/portal/login';

// Module-level state
let scanCancelled = false;
let isRunning = false;

// Resume state: tracks which clients were successfully processed in the last scan
let lastScanState = {
    processedClientIds: new Set(),  // IDs of clients that completed successfully
    wasCancelled: false,
    wasError: false,
    errors: 0,
    successes: 0,
    total: 0
};

// Helper: random delay between min and max seconds
const randomDelay = (minSec, maxSec) => {
    const ms = (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
    return new Promise(r => setTimeout(r, ms));
};

const ensureLoginForm = async (page) => {
    console.log('[DEBUG] Navigating to GIB login page:', GIB_LOGIN_URL);
    await page.goto(GIB_LOGIN_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    console.log('[DEBUG] Page loaded, URL:', page.url());
    await page.waitForSelector('#userid', { timeout: 30000 });
    console.log('[DEBUG] Login form found successfully!');
};

const solveCaptcha = async (page, apiKey) => {
    let captchaElement = await page.$('#imgCaptcha');

    if (!captchaElement) {
        const hasCaptcha = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.some(img =>
                img.alt?.toLowerCase().includes('captcha') ||
                img.className?.toLowerCase().includes('captcha') ||
                img.src?.includes('captcha')
            );
        });
        if (hasCaptcha) {
            captchaElement = await page.$('img[alt*="captcha" i], img[class*="captcha" i], img[src*="captcha" i]');
        }
    }

    if (!captchaElement) {
        throw new Error('Captcha elementi bulunamadı.');
    }

    console.log('[DEBUG] CAPTCHA element found, taking screenshot...');
    const captchaBuffer = await captchaElement.screenshot();
    const captchaBase64 = captchaBuffer.toString('base64');

    console.log('[DEBUG] Sending CAPTCHA to Gemini AI...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
        { text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.' },
        { inlineData: { mimeType: 'image/png', data: captchaBase64 } }
    ]);

    const response = await result.response;
    const captchaText = response.text().trim().replace(/\s/g, '');
    console.log('[DEBUG] Gemini solved CAPTCHA:', captchaText);
    return captchaText;
};

const logoutFromGIB = async (page) => {
    try {
        console.log('[DEBUG] Attempting GIB logout...');

        // Strategy 1: Find logout button/link by text
        const loggedOut = await page.evaluate(() => {
            const allElements = [
                ...Array.from(document.querySelectorAll('a')),
                ...Array.from(document.querySelectorAll('button')),
                ...Array.from(document.querySelectorAll('[role="button"]')),
                ...Array.from(document.querySelectorAll('[role="menuitem"]'))
            ];
            const logoutEl = allElements.find(el => {
                const text = (el.textContent || '').toLowerCase().trim();
                return text.includes('çıkış') || text.includes('çık') ||
                       text.includes('oturumu kapat') || text.includes('logout');
            });
            if (logoutEl) { logoutEl.click(); return true; }
            return false;
        });

        if (loggedOut) {
            console.log('[DEBUG] Logout button clicked');
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000));
        } else {
            // Strategy 2: Try user menu first, then logout
            await page.evaluate(() => {
                const triggers = document.querySelectorAll(
                    '[class*="avatar" i], [class*="user" i], [class*="profile" i]'
                );
                for (const t of triggers) {
                    if (t.textContent && t.textContent.length < 50) { t.click(); break; }
                }
            });
            await new Promise(r => setTimeout(r, 1500));

            const menuLogout = await page.evaluate(() => {
                const items = [
                    ...Array.from(document.querySelectorAll('[role="menuitem"]')),
                    ...Array.from(document.querySelectorAll('.MuiMenuItem-root')),
                    ...Array.from(document.querySelectorAll('li a'))
                ];
                const logoutItem = items.find(el =>
                    (el.textContent || '').toLowerCase().includes('çıkış') ||
                    (el.textContent || '').toLowerCase().includes('logout')
                );
                if (logoutItem) { logoutItem.click(); return true; }
                return false;
            });

            if (menuLogout) {
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
            } else {
                // Strategy 3: Direct logout URL
                console.log('[DEBUG] Trying direct logout URL...');
                await page.goto('https://dijital.gib.gov.tr/portal/logout', {
                    waitUntil: 'networkidle0', timeout: 10000
                }).catch(() => {});
            }
        }

        console.log('[DEBUG] Logout completed. URL:', page.url());
    } catch (err) {
        console.error('[DEBUG] Logout failed (non-critical):', err.message);
    }
};

const loginAndFetch = async (page, client, password, apiKey) => {
    await page.type('#userid', client.gib_user_code);
    await page.type('#sifre', password);

    const captchaCode = await solveCaptcha(page, apiKey);
    await page.type('#dk', captchaCode);

    // Find and click login button
    const loginSelectors = ['button[type="submit"]', '#giris', 'button.MuiButton-containedPrimary'];
    let clicked = false;

    for (const selector of loginSelectors) {
        const btn = await page.$(selector);
        if (btn) {
            console.log('[DEBUG] Login button found:', selector);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
                page.click(selector)
            ]);
            clicked = true;
            break;
        }
    }

    if (!clicked) {
        const clickedByText = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b =>
                b.textContent?.toLowerCase().includes('giriş') ||
                b.textContent?.toLowerCase().includes('oturum')
            );
            if (btn) { btn.click(); return true; }
            return false;
        });
        if (clickedByText) {
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
        } else {
            throw new Error('Giriş butonu bulunamadı.');
        }
    }

    await new Promise(r => setTimeout(r, 3000));
    const postLoginUrl = page.url();
    console.log('[DEBUG] Post-login URL:', postLoginUrl);

    if (postLoginUrl.includes('/login')) {
        throw new Error('Giriş başarısız - CAPTCHA veya kimlik bilgileri yanlış olabilir.');
    }

    // Navigate to E-Tebligat
    const eTebligatLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a =>
            a.textContent?.includes('E-Tebligat') ||
            a.textContent?.includes('e-Tebligat') ||
            a.href?.includes('tebligat')
        );
        return link ? { text: link.textContent?.trim(), href: link.href } : null;
    });

    if (eTebligatLink) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {}),
            page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const link = links.find(a =>
                    a.textContent?.includes('E-Tebligat') ||
                    a.textContent?.includes('e-Tebligat') ||
                    a.href?.includes('tebligat')
                );
                if (link) link.click();
            })
        ]);
        await new Promise(r => setTimeout(r, 3000));
        console.log('[DEBUG] E-Tebligat page URL:', page.url());
    } else {
        await page.goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
            waitUntil: 'networkidle0', timeout: 20000
        }).catch(() => {});
    }

    // Scrape tebligatlar
    const tableSelectors = [
        'table tbody tr',
        '[role="row"]',
        '.MuiDataGrid-row',
        '[class*="MuiDataGrid"] [role="row"]'
    ];

    let foundSelector = null;
    for (const sel of tableSelectors) {
        try {
            await page.waitForSelector(sel, { timeout: 5000 });
            const count = await page.evaluate(s => document.querySelectorAll(s).length, sel);
            if (count > 0) { foundSelector = sel; break; }
        } catch { /* try next */ }
    }

    if (!foundSelector) {
        console.log('[DEBUG] No tebligat rows found.');
        return [];
    }

    return await page.evaluate((selector) => {
        const rows = Array.from(document.querySelectorAll(selector));
        return rows.map(row => {
            let cols = row.querySelectorAll('td');
            if (cols.length === 0) {
                cols = row.querySelectorAll('[role="cell"], [class*="MuiDataGrid-cell"]');
            }
            if (cols.length < 3) return null;
            return {
                sender: cols[0]?.innerText?.trim(),
                subject: cols[1]?.innerText?.trim(),
                documentNo: cols[2]?.innerText?.trim(),
                status: cols[3]?.innerText?.trim(),
                date: cols[4]?.innerText?.trim(),
                endDate: cols[5]?.innerText?.trim()
            };
        }).filter(Boolean);
    }, foundSelector);
};

function cancelScan() {
    scanCancelled = true;
}

function getScanState() {
    return {
        canResume: lastScanState.processedClientIds.size > 0 &&
                   (lastScanState.wasCancelled || lastScanState.wasError) &&
                   lastScanState.processedClientIds.size < lastScanState.total,
        processedCount: lastScanState.processedClientIds.size,
        total: lastScanState.total,
        errors: lastScanState.errors,
        successes: lastScanState.successes,
        wasCancelled: lastScanState.wasCancelled
    };
}

function clearScanState() {
    lastScanState = {
        processedClientIds: new Set(),
        wasCancelled: false,
        wasError: false,
        errors: 0,
        successes: 0,
        total: 0
    };
}

async function run(onStatusUpdate, apiKey, scanConfig = {}, options = {}, deductCredit = null) {
    if (isRunning) {
        onStatusUpdate({ message: 'Tarama zaten devam ediyor.', type: 'error' });
        return;
    }

    isRunning = true;
    scanCancelled = false;

    const isResume = options.resume === true;
    const skipClientIds = isResume ? new Set(lastScanState.processedClientIds) : new Set();

    // Reset state for fresh scan, preserve for resume
    if (!isResume) {
        clearScanState();
    }

    const config = {
        delayMin: 15,
        delayMax: 45,
        batchSize: 20,
        batchPauseMin: 120,
        batchPauseMax: 300,
        maxCaptchaRetries: 3,
        ...scanConfig
    };

    const allClients = database.getClients().filter(c => c.status === 'active');

    if (allClients.length === 0) {
        onStatusUpdate({ message: 'Tanımlı aktif mükellef bulunamadı.', type: 'info' });
        isRunning = false;
        return;
    }

    if (!apiKey) {
        onStatusUpdate({ message: 'API anahtarı bulunamadı.', type: 'error' });
        isRunning = false;
        return;
    }

    // Filter out already-processed clients when resuming
    const clients = isResume
        ? allClients.filter(c => !skipClientIds.has(c.id))
        : allClients;

    const totalAll = allClients.length;
    const totalRemaining = clients.length;

    // Update total in state
    lastScanState.total = totalAll;

    if (isResume && totalRemaining === 0) {
        onStatusUpdate({ message: 'Devam edilecek mükellef kalmadı.', type: 'info' });
        isRunning = false;
        return;
    }

    if (isResume) {
        onStatusUpdate({
            message: `Tarama devam ediyor: ${skipClientIds.size} mükellef atlanıyor, kalan ${totalRemaining} mükellef taranacak.`,
            type: 'info'
        });
    } else {
        onStatusUpdate({ message: `${totalAll} aktif mükellef için tarama başlatılıyor...`, type: 'info' });
    }

    const alreadyDone = isResume ? skipClientIds.size : 0;
    let successCount = isResume ? lastScanState.successes : 0;
    let errorCount = isResume ? lastScanState.errors : 0;

    onStatusUpdate({
        type: 'progress',
        progress: { current: alreadyDone, total: totalAll, currentClient: null, errors: errorCount, successes: successCount }
    });

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        for (let i = 0; i < totalRemaining; i++) {
            if (scanCancelled) {
                lastScanState.wasCancelled = true;
                lastScanState.wasError = false;
                lastScanState.errors = errorCount;
                lastScanState.successes = successCount;
                onStatusUpdate({ message: `Tarama durduruldu. (${alreadyDone + i}/${totalAll})`, type: 'info' });
                break;
            }

            const client = clients[i];

            // Kredi kontrolü: her mükellef öncesi 1 kredi düş
            if (deductCredit) {
                const creditResult = await deductCredit();
                if (!creditResult.success && creditResult.error === 'insufficient_credits') {
                    lastScanState.wasCancelled = true;
                    lastScanState.errors = errorCount;
                    lastScanState.successes = successCount;
                    onStatusUpdate({ message: 'Kredi yetersiz. Tarama durduruldu.', type: 'error' });
                    onStatusUpdate({
                        type: 'progress',
                        progress: { current: alreadyDone + i, total: totalAll, currentClient: null, errors: errorCount, successes: successCount, insufficientCredits: true }
                    });
                    break;
                }
            }

            const password = database.getClientPassword(client.id);

            if (!password) {
                onStatusUpdate({ message: `${client.firm_name}: Şifre bulunamadı.`, type: 'error', firmId: client.id });
                errorCount++;
                continue;
            }

            // Batch pause (based on processed count in this session)
            if (i > 0 && i % config.batchSize === 0) {
                const batchNum = Math.floor(i / config.batchSize);
                onStatusUpdate({ message: `Grup ${batchNum} tamamlandı. Sunucu yükünü azaltmak için bekleniyor...`, type: 'info' });
                await randomDelay(config.batchPauseMin, config.batchPauseMax);
                if (scanCancelled) {
                    lastScanState.wasCancelled = true;
                    lastScanState.errors = errorCount;
                    lastScanState.successes = successCount;
                    break;
                }
            }

            // Inter-client delay
            if (i > 0) {
                const delaySec = Math.floor(Math.random() * (config.delayMax - config.delayMin + 1)) + config.delayMin;
                onStatusUpdate({ message: `Sonraki mükellef için ${delaySec}s bekleniyor...`, type: 'info' });
                await randomDelay(config.delayMin, config.delayMax);
                if (scanCancelled) {
                    lastScanState.wasCancelled = true;
                    lastScanState.errors = errorCount;
                    lastScanState.successes = successCount;
                    break;
                }
            }

            const globalIndex = alreadyDone + i + 1;

            onStatusUpdate({
                message: `[${globalIndex}/${totalAll}] ${client.firm_name} sorgulanıyor...`,
                type: 'process',
                firmId: client.id
            });

            onStatusUpdate({
                type: 'progress',
                progress: { current: alreadyDone + i, total: totalAll, currentClient: client.firm_name, errors: errorCount, successes: successCount }
            });

            let succeeded = false;
            let lastError = null;

            for (let attempt = 1; attempt <= config.maxCaptchaRetries; attempt++) {
                if (scanCancelled) break;

                let page;
                try {
                    page = await browser.newPage();
                    await page.setUserAgent(USER_AGENT);
                    await page.setViewport({ width: 1280, height: 800 });

                    await ensureLoginForm(page);
                    const tebligatlar = await loginAndFetch(page, client, password, apiKey);

                    const count = tebligatlar.length;
                    let savedCount = 0;

                    if (count === 0) {
                        // Tebligat bulunamadı - "Tebligat yok" kaydı oluştur
                        const noNotificationRecord = [{
                            sender: '-',
                            subject: '-',
                            documentNo: '-',
                            status: 'Tebligat yok',
                            date: new Date().toLocaleDateString('tr-TR'),
                            endDate: null
                        }];
                        savedCount = database.saveTebligatlar(client.id, noNotificationRecord);
                        onStatusUpdate({
                            message: `${client.firm_name}: Tebligat bulunamadı.`,
                            type: 'success',
                            firmId: client.id
                        });
                    } else {
                        savedCount = database.saveTebligatlar(client.id, tebligatlar);
                        onStatusUpdate({
                            message: `${client.firm_name}: ${count} tebligat bulundu, ${savedCount} yeni kayıt eklendi.`,
                            type: 'success',
                            firmId: client.id
                        });
                    }

                    successCount++;
                    succeeded = true;

                    // Mark this client as processed
                    lastScanState.processedClientIds.add(client.id);

                    break;
                } catch (err) {
                    lastError = err;
                    console.error(`[${client.firm_name}] Deneme ${attempt}/${config.maxCaptchaRetries}:`, err.message);

                    const isCaptchaError = err.message.includes('Captcha') ||
                        err.message.includes('captcha') ||
                        err.message.includes('login sayfasında') ||
                        err.message.includes('Giriş başarısız');

                    if (isCaptchaError && attempt < config.maxCaptchaRetries) {
                        const backoffSec = 5 * Math.pow(2, attempt - 1);
                        onStatusUpdate({
                            message: `${client.firm_name}: CAPTCHA hatası, ${backoffSec}s sonra tekrar (${attempt}/${config.maxCaptchaRetries})`,
                            type: 'info', firmId: client.id
                        });
                        await new Promise(r => setTimeout(r, backoffSec * 1000));
                    } else {
                        break;
                    }
                } finally {
                    if (page) {
                        await logoutFromGIB(page);
                        await page.close();
                    }
                }
            }

            if (!succeeded) {
                errorCount++;
                // Still mark as processed so we don't retry failed ones on resume
                lastScanState.processedClientIds.add(client.id);
                if (lastError) {
                    onStatusUpdate({
                        message: `${client.firm_name}: Başarısız - ${lastError.message}`,
                        type: 'error', firmId: client.id
                    });
                }
            }
        }
    } catch (error) {
        lastScanState.wasError = true;
        lastScanState.errors = errorCount;
        lastScanState.successes = successCount;
        onStatusUpdate({ message: `Genel Hata: ${error.message}`, type: 'error' });
    } finally {
        if (browser) await browser.close();
        isRunning = false;
    }

    // Update final state
    lastScanState.errors = errorCount;
    lastScanState.successes = successCount;

    const allProcessed = lastScanState.processedClientIds.size >= totalAll;
    if (allProcessed) {
        lastScanState.wasCancelled = false;
        lastScanState.wasError = false;
    }

    onStatusUpdate({
        type: 'progress',
        progress: {
            current: lastScanState.processedClientIds.size,
            total: totalAll,
            currentClient: null,
            errors: errorCount,
            successes: successCount,
            completed: allProcessed
        }
    });

    onStatusUpdate({
        message: allProcessed
            ? `Tarama tamamlandı: ${successCount} başarılı, ${errorCount} hatalı.`
            : `Tarama durdu: ${successCount} başarılı, ${errorCount} hatalı. (${totalAll - lastScanState.processedClientIds.size} mükellef kaldı)`,
        type: successCount > 0 ? 'success' : 'info'
    });

    // Send scan state for UI
    onStatusUpdate({
        type: 'scan-state',
        scanState: getScanState()
    });
}

module.exports = { run, cancelScan, getScanState, clearScanState };
