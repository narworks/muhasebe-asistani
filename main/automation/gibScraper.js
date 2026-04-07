const puppeteer = require('puppeteer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const database = require('../database');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const GIB_LOGIN_URL = 'https://dijital.gib.gov.tr/portal/login';

const settings = require('../settings');
const logger = require('../logger');
const gibApiClient = require('./gibApiClient');
let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

// Get documents directory path (does NOT create it — call ensureDir before saving)
const getDocumentsDir = (clientId, firmName, dateStr) => {
    const s = settings.readSettings();
    const basePath = s.documentsFolder || path.join(app.getPath('userData'), 'documents');

    // Sanitize firm name for filesystem
    const safeFirmName = (firmName || String(clientId)).replace(/[<>:"/\\|?*]/g, '_').trim();

    // Parse date or use today
    let dateFolder;
    if (dateStr) {
        const match = dateStr.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
        if (match) {
            dateFolder = `${match[1]}-${match[2]}-${match[3]}`;
        } else {
            const match2 = dateStr.match(/(\d{2})[./](\d{2})[./](\d{4})/);
            if (match2) {
                dateFolder = `${match2[3]}-${match2[2]}-${match2[1]}`;
            } else {
                dateFolder = new Date().toISOString().split('T')[0];
            }
        }
    } else {
        dateFolder = new Date().toISOString().split('T')[0];
    }

    return path.join(basePath, safeFirmName, dateFolder);
};

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Download: İŞLEM YAP → Zarf İçeriği Gör → /tebligat-detay → BELGE GÖRÜNTÜLE (opens new tab) → GERİ
const downloadDocumentByClick = async (page, rowIndex, tableSelector, filePath) => {
    const docsDir = path.dirname(filePath);
    ensureDir(docsDir);

    const cdp = await page.createCDPSession();
    try {
        // Configure Chrome to download to our folder and report progress
        await cdp.send('Browser.setDownloadBehavior', {
            behavior: 'allowAndName',
            downloadPath: docsDir,
            eventsEnabled: true,
        });

        // Listen for download completion
        const dlDone = new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 20000);
            cdp.on('Browser.downloadProgress', (ev) => {
                if (ev.state === 'completed') {
                    clearTimeout(timer);
                    resolve(ev.guid);
                }
                if (ev.state === 'canceled') {
                    clearTimeout(timer);
                    resolve(null);
                }
            });
        });

        // Step 1: Click "İŞLEM YAP"
        const clicked = await page.evaluate(
            (sel, idx) => {
                const rows = Array.from(document.querySelectorAll(sel));
                const row = rows[idx];
                if (!row) return false;
                for (const btn of row.querySelectorAll('button')) {
                    const t = (btn.textContent || '').toUpperCase();
                    if (t.includes('İŞLEM') || t.includes('ISLEM')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            },
            tableSelector,
            rowIndex
        );
        if (!clicked) return null;
        await new Promise((r) => setTimeout(r, 1000));

        // Step 2: Click "Zarf İçeriği Gör"
        const menuOk = await page.evaluate(() => {
            for (const el of document.querySelectorAll(
                'li, [role="menuitem"], .MuiMenuItem-root, span, div, a'
            )) {
                const t = (el.textContent || '').trim();
                if (t === 'Zarf İçeriği Gör' || t === 'Zarf İçeriğini Gör') {
                    el.click();
                    return true;
                }
            }
            for (const el of document.querySelectorAll(
                'li, [role="menuitem"], .MuiMenuItem-root'
            )) {
                if ((el.textContent || '').toLowerCase().includes('zarf içeriği')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });
        if (!menuOk) {
            await page.keyboard.press('Escape').catch(() => {});
            return null;
        }

        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));

        // Step 3: Click "BELGE GÖRÜNTÜLE" — triggers direct file download
        await page.evaluate(() => {
            for (const b of document.querySelectorAll('button, a')) {
                const t = (b.textContent || '').toUpperCase();
                if (t.includes('BELGE GÖRÜNTÜLE') || t.includes('BELGE GORUNTULE')) {
                    b.click();
                    return;
                }
            }
        });

        // Wait for Chrome download to finish
        const guid = await dlDone;

        // Step 4: Go back to list
        await page.evaluate(() => {
            for (const b of document.querySelectorAll('button, a')) {
                const t = (b.textContent || '').toUpperCase();
                if (t.includes('GERİ') || t.includes('GERI')) {
                    b.click();
                    return;
                }
            }
        });
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

        // Rename the downloaded file (Chrome saves with guid as filename)
        if (guid) {
            const guidPath = path.join(docsDir, guid);
            if (fs.existsSync(guidPath)) {
                fs.renameSync(guidPath, filePath);
                logger.debug(`[DL] Saved: ${filePath}`);
                return filePath;
            }
        }

        // Fallback: find any new file in docsDir
        const files = fs.readdirSync(docsDir).filter((f) => f !== path.basename(filePath));
        for (const f of files) {
            const fp = path.join(docsDir, f);
            if (fs.statSync(fp).size > 1000) {
                fs.renameSync(fp, filePath);
                logger.debug(`[DL] Renamed ${f} → ${path.basename(filePath)}`);
                return filePath;
            }
        }
    } catch (err) {
        logger.debug(`[DL] Error row ${rowIndex}: ${err.message}`);
    } finally {
        await cdp.detach().catch(() => {});
    }

    return null;
};

// Module-level state
let scanCancelled = false;
let isRunning = false;
let activeBrowser = null;

// Rate limiting to prevent GIB IP blocking
const DAILY_CLIENT_LIMIT = 200; // Competitors handle 150-450/day without blocks
const HOURLY_CLIENT_LIMIT = 50; // ~1 client per 1-2 min

// Persisted rate limit state — survives app restart
// Monotonic time checks prevent OS clock manipulation:
// - If clock goes backward → no reset allowed (counters preserved)
// - Daily reset requires at least 20h elapsed since last reset (real time)
// - Hourly reset requires at least 50min elapsed since last reset
const MIN_DAILY_RESET_MS = 20 * 60 * 60 * 1000;
const MIN_HOURLY_RESET_MS = 50 * 60 * 1000;

function applyRateLimitResets(state) {
    const now = Date.now();
    const today = new Date().toDateString();
    const currentHour = new Date().getHours();

    // Detect clock manipulation: don't reset if clock went backward
    if (state.lastSeenTime && now < state.lastSeenTime) {
        return state;
    }

    // Daily reset — date changed AND at least 20h real time elapsed
    if (
        state.dailyScanDate !== today &&
        (!state.dailyResetAt || now - state.dailyResetAt >= MIN_DAILY_RESET_MS)
    ) {
        state.dailyScanCount = 0;
        state.dailyScanDate = today;
        state.dailyResetAt = now;
    }

    // Hourly reset — hour changed AND at least 50min real time elapsed
    if (
        (state.hourlyScanDate !== today || state.hourlyScanHour !== currentHour) &&
        (!state.hourlyResetAt || now - state.hourlyResetAt >= MIN_HOURLY_RESET_MS)
    ) {
        state.hourlyScanCount = 0;
        state.hourlyScanHour = currentHour;
        state.hourlyScanDate = today;
        state.hourlyResetAt = now;
    }

    return state;
}

function loadRateLimits() {
    try {
        const s = settings.readSettings();
        const r = s.rateLimits || {};
        const now = Date.now();
        return applyRateLimitResets({
            dailyScanCount: r.dailyScanCount || 0,
            dailyScanDate: r.dailyScanDate || new Date().toDateString(),
            dailyResetAt: r.dailyResetAt || now,
            hourlyScanCount: r.hourlyScanCount || 0,
            hourlyScanHour: r.hourlyScanHour ?? new Date().getHours(),
            hourlyScanDate: r.hourlyScanDate || new Date().toDateString(),
            hourlyResetAt: r.hourlyResetAt || now,
            lastSeenTime: r.lastSeenTime || now,
        });
    } catch {
        const now = Date.now();
        return {
            dailyScanCount: 0,
            dailyScanDate: new Date().toDateString(),
            dailyResetAt: now,
            hourlyScanCount: 0,
            hourlyScanHour: new Date().getHours(),
            hourlyScanDate: new Date().toDateString(),
            hourlyResetAt: now,
            lastSeenTime: now,
        };
    }
}

function saveRateLimits() {
    try {
        const now = Date.now();
        if (now > lastSeenTime) lastSeenTime = now;
        settings.updateSettings({
            rateLimits: {
                dailyScanCount,
                dailyScanDate,
                dailyResetAt,
                hourlyScanCount,
                hourlyScanHour,
                hourlyScanDate: dailyScanDate,
                hourlyResetAt,
                lastSeenTime,
            },
        });
    } catch {
        /* ignore persist errors */
    }
}

const _initial = loadRateLimits();
let dailyScanCount = _initial.dailyScanCount;
let dailyScanDate = _initial.dailyScanDate;
let dailyResetAt = _initial.dailyResetAt;
let hourlyScanCount = _initial.hourlyScanCount;
let hourlyScanHour = _initial.hourlyScanHour;
let hourlyResetAt = _initial.hourlyResetAt;
let lastSeenTime = _initial.lastSeenTime;

// Resume state: tracks which clients were successfully processed in the last scan
let lastScanState = {
    processedClientIds: new Set(), // IDs of clients that completed successfully
    wasCancelled: false,
    wasError: false,
    errors: 0,
    successes: 0,
    total: 0,
};

// Helper: random delay between min and max seconds
const randomDelay = async (minSec, maxSec) => {
    const sec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    await new Promise((r) => setTimeout(r, sec * 1000));
    return sec;
};

// Named delays for human-like behavior simulation
// Competitor-matched timing (tebligattakip.com runs 150 clients 3x/day without blocks)
const HUMAN_DELAYS = {
    betweenDocuments: [5, 10], // Between document downloads
    betweenPages: [3, 5], // Between pagination
    afterPageLoad: [2, 4], // After page load
    betweenClients: [15, 30], // Between client sessions
    batchPause: [60, 120], // Break between batches
};

// CRITICAL: Detect GIB IP Reputation Block page
// If detected, ALL operations must stop immediately to prevent further damage
const checkForIPBlock = async (page) => {
    const isBlocked = await page
        .evaluate(() => {
            const bodyText = (document.body?.innerText || '').toLowerCase();
            return (
                bodyText.includes('ip reputation block') ||
                bodyText.includes('malicious ips list') ||
                bodyText.includes('ip adresiniz engellenmistir') ||
                bodyText.includes('ip adresi engellendi') ||
                bodyText.includes('erisim engellendi')
            );
        })
        .catch(() => false);

    if (isBlocked) {
        throw new Error('GIB_IP_BLOCKED');
    }
};

const ensureLoginForm = async (page) => {
    logger.debug('[DEBUG] Navigating to GIB login page:', GIB_LOGIN_URL);
    await page.goto(GIB_LOGIN_URL, { waitUntil: 'networkidle0', timeout: 60000 });

    // Check for IP block BEFORE anything else
    await checkForIPBlock(page);

    logger.debug('[DEBUG] Page loaded, URL:', page.url());
    await page.waitForSelector('#userid', { timeout: 30000 });
    logger.debug('[DEBUG] Login form found successfully!');
};

const solveCaptcha = async (page, apiKey) => {
    let captchaElement = await page.$('#imgCaptcha');

    if (!captchaElement) {
        const hasCaptcha = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.some(
                (img) =>
                    img.alt?.toLowerCase().includes('captcha') ||
                    img.className?.toLowerCase().includes('captcha') ||
                    img.src?.includes('captcha')
            );
        });
        if (hasCaptcha) {
            captchaElement = await page.$(
                'img[alt*="captcha" i], img[class*="captcha" i], img[src*="captcha" i]'
            );
        }
    }

    if (!captchaElement) {
        throw new Error('Captcha elementi bulunamadı.');
    }

    logger.debug('[DEBUG] CAPTCHA element found, taking screenshot...');
    const captchaBuffer = await captchaElement.screenshot();
    const captchaBase64 = captchaBuffer.toString('base64');

    logger.debug('[DEBUG] Sending CAPTCHA to Gemini AI...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Retry Gemini API calls with backoff for rate limits
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const result = await model.generateContent([
                {
                    text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.',
                },
                { inlineData: { mimeType: 'image/png', data: captchaBase64 } },
            ]);
            const response = await result.response;
            const captchaText = response.text().trim().replace(/\s/g, '');
            logger.debug('[DEBUG] Gemini solved CAPTCHA:', captchaText);
            return captchaText;
        } catch (err) {
            const isRateLimit =
                err.message &&
                (err.message.includes('429') ||
                    err.message.includes('Rate') ||
                    err.message.includes('exhausted'));
            if (isRateLimit && attempt < 3) {
                const waitSec = 30 * attempt;
                logger.debug(
                    `[DEBUG] Gemini rate limited, waiting ${waitSec}s (attempt ${attempt}/3)`
                );
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }
            throw err;
        }
    }
};

const logoutFromGIB = async (page) => {
    try {
        logger.debug('[DEBUG] Attempting GIB logout...');

        // Strategy 1: Find logout button/link by text
        const loggedOut = await page.evaluate(() => {
            const allElements = [
                ...Array.from(document.querySelectorAll('a')),
                ...Array.from(document.querySelectorAll('button')),
                ...Array.from(document.querySelectorAll('[role="button"]')),
                ...Array.from(document.querySelectorAll('[role="menuitem"]')),
            ];
            const logoutEl = allElements.find((el) => {
                const text = (el.textContent || '').toLowerCase().trim();
                return (
                    text.includes('çıkış') ||
                    text.includes('çık') ||
                    text.includes('oturumu kapat') ||
                    text.includes('logout')
                );
            });
            if (logoutEl) {
                logoutEl.click();
                return true;
            }
            return false;
        });

        if (loggedOut) {
            logger.debug('[DEBUG] Logout button clicked');
            await page
                .waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 })
                .catch(() => {});
            await new Promise((r) => setTimeout(r, 2000));
        } else {
            // Strategy 2: Try user menu first, then logout
            await page.evaluate(() => {
                const triggers = document.querySelectorAll(
                    '[class*="avatar" i], [class*="user" i], [class*="profile" i]'
                );
                for (const t of triggers) {
                    if (t.textContent && t.textContent.length < 50) {
                        t.click();
                        break;
                    }
                }
            });
            await new Promise((r) => setTimeout(r, 1500));

            const menuLogout = await page.evaluate(() => {
                const items = [
                    ...Array.from(document.querySelectorAll('[role="menuitem"]')),
                    ...Array.from(document.querySelectorAll('.MuiMenuItem-root')),
                    ...Array.from(document.querySelectorAll('li a')),
                ];
                const logoutItem = items.find(
                    (el) =>
                        (el.textContent || '').toLowerCase().includes('çıkış') ||
                        (el.textContent || '').toLowerCase().includes('logout')
                );
                if (logoutItem) {
                    logoutItem.click();
                    return true;
                }
                return false;
            });

            if (menuLogout) {
                await page
                    .waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 })
                    .catch(() => {});
            } else {
                // Strategy 3: Direct logout URL
                logger.debug('[DEBUG] Trying direct logout URL...');
                await page
                    .goto('https://dijital.gib.gov.tr/portal/logout', {
                        waitUntil: 'networkidle0',
                        timeout: 10000,
                    })
                    .catch(() => {});
            }
        }

        logger.debug('[DEBUG] Logout completed. URL:', page.url());
    } catch (err) {
        logger.error('[DEBUG] Logout failed (non-critical):', err.message);
    }
};

// Extract tebligat data from current page
// GİB Portal table structure:
// [checkbox] | Gönderen Kurum | Alt Birim | Belge Türü | Belge No | Gönderme Tarihi | Tebliğ Tarihi | Mükellef
const extractTebligatFromPage = async (page, selector) => {
    return await page.evaluate((sel) => {
        const rows = Array.from(document.querySelectorAll(sel));
        return rows
            .map((row, rowIndex) => {
                let cols = row.querySelectorAll('td');
                if (cols.length === 0) {
                    cols = row.querySelectorAll('[role="cell"], [class*="MuiDataGrid-cell"]');
                }
                if (cols.length < 4) return null;

                // Skip header row if it contains th elements
                if (row.querySelector('th')) return null;

                // Determine column offset (some tables have checkbox as first column)
                let offset = 0;
                const firstCell = cols[0];
                if (firstCell) {
                    const hasCheckbox =
                        firstCell.querySelector('input[type="checkbox"]') ||
                        firstCell.querySelector('[role="checkbox"]') ||
                        firstCell.classList.contains('checkbox') ||
                        firstCell.innerText?.trim() === '';
                    if (hasCheckbox) offset = 1;
                }

                // GİB Portal column mapping (with offset for checkbox)
                const senderInstitution = cols[offset]?.innerText?.trim() || ''; // Gönderen Kurum
                const subUnit = cols[offset + 1]?.innerText?.trim() || ''; // Alt Birim
                const documentType = cols[offset + 2]?.innerText?.trim() || ''; // Belge Türü
                const documentNo = cols[offset + 3]?.innerText?.trim() || ''; // Belge No
                const sendDate = cols[offset + 4]?.innerText?.trim() || ''; // Gönderme Tarihi
                const notificationDate = cols[offset + 5]?.innerText?.trim() || ''; // Tebliğ Tarihi
                const readDate = cols[offset + 6]?.innerText?.trim() || ''; // Mükellef Okuma Tarihi

                const documentUrl = `__CLICK_ROW__:${rowIndex}`;

                return {
                    sender: senderInstitution || subUnit || 'GİB',
                    subUnit: subUnit,
                    documentType: documentType,
                    subject: `${documentType} - ${subUnit}`.trim() || 'Tebligat',
                    documentNo: documentNo,
                    status: readDate ? 'Okunmuş' : 'Okunmamış',
                    date: notificationDate || sendDate,
                    sendDate: sendDate,
                    notificationDate: notificationDate,
                    readDate: readDate,
                    documentUrl: documentUrl,
                    rowIndex: rowIndex,
                };
            })
            .filter(Boolean);
    }, selector);
};

// Check if there's a next page and navigate to it
const goToNextPage = async (page) => {
    // Try various pagination selectors
    const nextPageResult = await page.evaluate(() => {
        // Strategy 1: Look for "next" button by common patterns
        const nextButtonSelectors = [
            'button[aria-label*="next" i]',
            'button[aria-label*="sonraki" i]',
            'button[title*="next" i]',
            'button[title*="sonraki" i]',
            '[class*="next" i]',
            '[class*="sonraki" i]',
            'a[aria-label*="next" i]',
            'a[aria-label*="sonraki" i]',
        ];

        for (const sel of nextButtonSelectors) {
            const btn = document.querySelector(sel);
            if (btn && !btn.disabled && !btn.classList.contains('disabled')) {
                btn.click();
                return { clicked: true, method: 'next-button' };
            }
        }

        // Strategy 2: Look for MUI DataGrid pagination
        const muiNextBtn = document.querySelector('.MuiTablePagination-actions button:last-child');
        if (muiNextBtn && !muiNextBtn.disabled) {
            muiNextBtn.click();
            return { clicked: true, method: 'mui-pagination' };
        }

        // Strategy 3: Look for numbered pagination and click next number
        const paginationContainer = document.querySelector(
            '[class*="pagination" i], nav[aria-label*="pagination" i]'
        );
        if (paginationContainer) {
            const currentPage = paginationContainer.querySelector(
                '[aria-current="page"], .active, [class*="selected"]'
            );
            if (currentPage) {
                const currentPageNum = parseInt(currentPage.textContent, 10);
                if (!isNaN(currentPageNum)) {
                    // Find next page number
                    const allPageLinks = paginationContainer.querySelectorAll('a, button');
                    for (const link of allPageLinks) {
                        const num = parseInt(link.textContent, 10);
                        if (num === currentPageNum + 1) {
                            link.click();
                            return { clicked: true, method: 'numbered-pagination' };
                        }
                    }
                }
            }
        }

        // Strategy 4: Look for ">" or ">>" buttons
        const arrowButtons = document.querySelectorAll('button, a');
        for (const btn of arrowButtons) {
            const text = btn.textContent?.trim();
            if (
                (text === '>' ||
                    text === '»' ||
                    text === '›' ||
                    text === 'İleri' ||
                    text === 'Sonraki') &&
                !btn.disabled &&
                !btn.classList.contains('disabled')
            ) {
                btn.click();
                return { clicked: true, method: 'arrow-button' };
            }
        }

        return { clicked: false };
    });

    if (nextPageResult.clicked) {
        logger.debug('[DEBUG] Navigated to next page using:', nextPageResult.method);
        await new Promise((r) => setTimeout(r, 2000)); // Wait for page to load
        return true;
    }

    return false;
};

// Check if current page has data
const hasDataOnPage = async (page, selector) => {
    const count = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
    }, selector);
    return count > 0;
};

const loginAndFetch = async (
    page,
    client,
    password,
    apiKey,
    onStatus = null,
    isFirstScan = false
) => {
    const status = (msg) => {
        if (onStatus) onStatus({ message: `  → ${msg}`, type: 'process', firmId: client.id });
    };

    // Capture Bearer token from GİB login response for direct API access
    let bearerToken = null;
    page.on('response', async (resp) => {
        if (resp.url().includes('/apigateway/auth/tdvd/login') && resp.status() === 200) {
            try {
                const text = await resp.text();
                const body = JSON.parse(text);
                if (body.token && body.result !== false) {
                    bearerToken = body.token;
                    logger.debug('[API] Bearer token captured from login response');
                }
            } catch (e) {
                logger.debug('[API] Token capture failed:', e.message);
            }
        }
    });
    // Also capture token from request Authorization header as fallback
    page.on('request', (req) => {
        if (
            !bearerToken &&
            req.url().includes('gib.gov.tr/apigateway/') &&
            req.headers()['authorization']
        ) {
            const auth = req.headers()['authorization'];
            if (auth.startsWith('Bearer ')) {
                bearerToken = auth.substring(7);
                logger.debug('[API] Bearer token captured from request header');
            }
        }
    });

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
            logger.debug('[DEBUG] Login button found:', selector);
            await Promise.all([
                page
                    .waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 })
                    .catch(() => {}),
                page.click(selector),
            ]);
            clicked = true;
            break;
        }
    }

    if (!clicked) {
        const clickedByText = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(
                (b) =>
                    b.textContent?.toLowerCase().includes('giriş') ||
                    b.textContent?.toLowerCase().includes('oturum')
            );
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (clickedByText) {
            await page
                .waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 })
                .catch(() => {});
        } else {
            throw new Error('Giriş butonu bulunamadı.');
        }
    }

    await randomDelay(...HUMAN_DELAYS.afterPageLoad);
    const postLoginUrl = page.url();
    logger.debug('[DEBUG] Post-login URL:', postLoginUrl);

    if (postLoginUrl.includes('/login')) {
        throw new Error('Giriş başarısız - CAPTCHA veya kimlik bilgileri yanlış olabilir.');
    }

    // Direct API mode: use HTTP calls instead of Puppeteer scraping (20x faster)
    if (bearerToken) {
        try {
            const apiClient = gibApiClient.createApiClient(bearerToken);
            status('API ile tebligatlar çekiliyor...');

            let allDtos = [];
            if (isFirstScan) {
                const [nonArchived, archived] = await Promise.all([
                    gibApiClient.fetchAllTebligatlar(apiClient),
                    gibApiClient.fetchAllTebligatlar(apiClient, { arsivDurum: 1 }),
                ]);
                allDtos = [...nonArchived, ...archived];
            } else {
                allDtos = await gibApiClient.fetchAllTebligatlar(apiClient);
            }

            const mapped = allDtos.map(gibApiClient.mapTebligatDto);
            status(`${mapped.length} tebligat bulundu (API), dökümanlar indiriliyor...`);

            for (let i = 0; i < mapped.length; i++) {
                if (scanCancelled) break;

                const teb = mapped[i];
                const docsDir = getDocumentsDir(
                    client.id,
                    client.firm_name,
                    teb.date || teb.notificationDate || teb.sendDate
                );
                const safeDocNo = (teb.documentNo || 'doc').replace(/[^a-zA-Z0-9-_]/g, '_');
                const baseName = `tebligat_${safeDocNo}`;
                const filePath = path.join(docsDir, `${baseName}.pdf`);

                // Check for existing file with any extension (.pdf, .imz, etc.)
                const existingFile = ['.pdf', '.imz', '.jpg', '.png'].reduce((found, ext) => {
                    if (found) return found;
                    const p = path.join(docsDir, `${baseName}${ext}`);
                    return fs.existsSync(p) ? p : null;
                }, null);

                if (existingFile) {
                    teb.documentPath = existingFile;
                    teb._newDownload = false;
                    continue;
                }

                status(
                    `Döküman indiriliyor (${i + 1}/${mapped.length}): ${teb.documentNo || '?'}...`
                );

                try {
                    const dlPath = await gibApiClient.downloadDocument(apiClient, teb, filePath);
                    if (dlPath) {
                        teb.documentPath = dlPath;
                        teb._newDownload = true;
                    }
                } catch (dlErr) {
                    logger.debug(`[API DL] ${teb.documentNo}: ${dlErr.message}`);
                }

                if (i < mapped.length - 1) {
                    await randomDelay(...HUMAN_DELAYS.betweenDocuments);
                }
            }

            status(`Tarama tamamlandı: ${mapped.length} tebligat (API).`);
            return mapped;
        } catch (apiErr) {
            logger.debug('[API] API mode failed, falling back to Puppeteer:', apiErr.message);
            status(`API hatası (${apiErr.message}), tarayıcı moduna geçiliyor...`);
        }
    }

    // Fallback: Puppeteer-based scraping (Navigate to E-Tebligat)
    const eTebligatLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(
            (a) =>
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
                const link = links.find(
                    (a) =>
                        a.textContent?.includes('E-Tebligat') ||
                        a.textContent?.includes('e-Tebligat') ||
                        a.href?.includes('tebligat')
                );
                if (link) link.click();
            }),
        ]);
        await randomDelay(...HUMAN_DELAYS.afterPageLoad);
        logger.debug('[DEBUG] E-Tebligat page URL:', page.url());
    } else {
        await page
            .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                waitUntil: 'networkidle0',
                timeout: 20000,
            })
            .catch(() => {});
    }

    // First scan: all 3 tabs to capture complete history
    // Subsequent scans: only Okunmamış (new notifications)
    const tabs = isFirstScan ? ['OKUNMAMIŞ', 'OKUNMUŞ', 'ARŞİVLENMİŞ'] : ['OKUNMAMIŞ'];
    const allTebligatlarFromAllTabs = [];

    for (const tabName of tabs) {
        // Click the tab
        const tabClicked = await page.evaluate((name) => {
            const els = document.querySelectorAll('button, [role="tab"], div, span, a');
            for (const el of els) {
                const text = (el.textContent || '').toUpperCase();
                if (text.includes(name) && text.includes('TEBLİGATLAR')) {
                    el.click();
                    return true;
                }
            }
            return false;
        }, tabName);

        if (!tabClicked) {
            logger.debug(`[DEBUG] Tab "${tabName}" not found, skipping`);
            continue;
        }

        await new Promise((r) => setTimeout(r, 2000));

        // Also click "FİLTRELE" button to load the table if needed
        await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                if ((b.textContent || '').toUpperCase().includes('FİLTRELE')) {
                    b.click();
                    return;
                }
            }
        });
        await new Promise((r) => setTimeout(r, 2000));

        // Find table selector
        const tableSelectors = [
            'table tbody tr',
            '[role="row"]',
            '.MuiDataGrid-row',
            '[class*="MuiDataGrid"] [role="row"]',
        ];

        let foundSelector = null;
        for (const sel of tableSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 5000 });
                const count = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
                if (count > 0) {
                    foundSelector = sel;
                    break;
                }
            } catch {
                /* try next */
            }
        }

        if (!foundSelector) {
            logger.debug(`[DEBUG] No table found for tab "${tabName}"`);
            continue;
        }

        // Extract from all pages and download documents while on each page
        const allTebligatlar = [];
        status(`${tabName} tabı taranıyor...`);
        let pageNum = 1;
        const maxPages = 20; // Safety limit to prevent infinite loops

        // Helper: check if the page target is still alive
        const isPageUsable = () => {
            try {
                return !page.isClosed();
            } catch {
                return false;
            }
        };

        while (pageNum <= maxPages) {
            logger.debug(`[DEBUG] Scraping page ${pageNum}...`);

            // Extract data from current page
            let pageTebligatlar;
            try {
                pageTebligatlar = await extractTebligatFromPage(page, foundSelector);
            } catch (extractErr) {
                logger.debug(
                    `[DEBUG] Failed to extract tebligatlar on page ${pageNum}:`,
                    extractErr.message
                );
                break;
            }
            logger.debug(`[DEBUG] Found ${pageTebligatlar.length} tebligatlar on page ${pageNum}`);

            if (pageTebligatlar.length === 0) {
                break; // No more data
            }

            if (pageNum === 1) {
                status(
                    `${pageTebligatlar.length} tebligat bulundu (sayfa ${pageNum}), dökümanlar indiriliyor...`
                );
            } else {
                status(`Sayfa ${pageNum}: ${pageTebligatlar.length} tebligat daha bulundu.`);
            }

            // Add scraped data first — preserved even if downloads fail
            allTebligatlar.push(...pageTebligatlar);

            // Download documents for this page via CDP Fetch interception
            try {
                for (let i = 0; i < pageTebligatlar.length; i++) {
                    if (!isPageUsable()) {
                        status('Sayfa bağlantısı kesildi (veriler korundu).');
                        break;
                    }

                    const tebligat = pageTebligatlar[i];
                    if (!tebligat.documentUrl || !tebligat.documentUrl.startsWith('__CLICK_ROW__:'))
                        continue;

                    const docsDir = getDocumentsDir(
                        client.id,
                        client.firm_name,
                        tebligat.date || tebligat.notificationDate || tebligat.sendDate
                    );
                    const safeDocNo = (tebligat.documentNo || 'doc').replace(
                        /[^a-zA-Z0-9-_]/g,
                        '_'
                    );
                    const pdfPath = path.join(docsDir, `tebligat_${safeDocNo}.pdf`);
                    const filePath = pdfPath;

                    // Skip if already downloaded (check multiple extensions)
                    const existingDlFile = ['.pdf', '.imz', '.jpg', '.png'].reduce((f, ext) => {
                        if (f) return f;
                        const p = path.join(docsDir, `tebligat_${safeDocNo}${ext}`);
                        return fs.existsSync(p) ? p : null;
                    }, null);
                    if (existingDlFile) {
                        tebligat.documentPath = existingDlFile;
                        tebligat._newDownload = false;
                        continue;
                    }

                    status(
                        `Döküman indiriliyor (${i + 1}/${pageTebligatlar.length}): ${tebligat.documentNo || '?'}...`
                    );

                    try {
                        const docPath = await downloadDocumentByClick(
                            page,
                            i,
                            foundSelector,
                            filePath
                        );
                        if (docPath) {
                            tebligat.documentPath = docPath;
                            tebligat._newDownload = true;
                        }

                        // Navigate back to the list page (download goes to detail page)
                        if (!isPageUsable()) break;
                        const currentUrl = page.url();
                        if (
                            currentUrl.includes('tebligat-detay') ||
                            !currentUrl.endsWith('/e-tebligat')
                        ) {
                            await page
                                .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                                    waitUntil: 'networkidle0',
                                    timeout: 20000,
                                })
                                .catch(() => {});
                        }
                        await page
                            .waitForSelector(foundSelector, { timeout: 10000 })
                            .catch(() => {});
                        // Human-like delay between document downloads
                        await randomDelay(...HUMAN_DELAYS.betweenDocuments);
                    } catch (dlErr) {
                        logger.debug(`[DEBUG] Download error for row ${i}:`, dlErr.message);
                        if (!isPageUsable()) break;
                        // Try to recover to the list page
                        await page
                            .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                                waitUntil: 'networkidle0',
                                timeout: 20000,
                            })
                            .catch(() => {});
                        await page
                            .waitForSelector(foundSelector, { timeout: 10000 })
                            .catch(() => {});
                    }
                }
            } catch (loopErr) {
                logger.debug('[DEBUG] Download loop error (data preserved):', loopErr.message);
            }

            // If page is dead, stop pagination but keep the data we have
            if (!isPageUsable()) {
                logger.debug('[DEBUG] Page target lost, stopping pagination.');
                break;
            }

            // Try to go to next page
            status('Sonraki sayfa kontrol ediliyor...');
            let hasNextPage = false;
            try {
                hasNextPage = await goToNextPage(page);
            } catch (navErr) {
                logger.debug('[DEBUG] Pagination error:', navErr.message);
                break;
            }
            if (!hasNextPage) {
                logger.debug('[DEBUG] No more pages to scrape.');
                break;
            }

            // Human-like delay before checking next page content
            await randomDelay(...HUMAN_DELAYS.betweenPages);

            // Verify we're on a new page with data
            let hasData = false;
            try {
                hasData = await hasDataOnPage(page, foundSelector);
            } catch {
                break;
            }
            if (!hasData) {
                logger.debug('[DEBUG] Next page has no data, stopping pagination.');
                break;
            }

            pageNum++;
        }

        allTebligatlarFromAllTabs.push(...allTebligatlar);
    } // end of tabs loop

    // Clean up empty date directories
    const s = settings.readSettings();
    const basePath = s.documentsFolder || path.join(app.getPath('userData'), 'documents');
    const safeFirmName = (client.firm_name || String(client.id))
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();
    const firmDir = path.join(basePath, safeFirmName);
    if (fs.existsSync(firmDir)) {
        try {
            for (const df of fs.readdirSync(firmDir)) {
                const dfPath = path.join(firmDir, df);
                if (fs.statSync(dfPath).isDirectory() && fs.readdirSync(dfPath).length === 0) {
                    fs.rmdirSync(dfPath);
                }
            }
        } catch {
            /* ignore cleanup errors */
        }
    }

    status(`Tarama tamamlandı: ${allTebligatlarFromAllTabs.length} tebligat.`);

    return allTebligatlarFromAllTabs;
};

function cancelScan() {
    scanCancelled = true;
    // Force close browser to stop any ongoing download/navigation immediately
    if (activeBrowser) {
        activeBrowser.close().catch(() => {});
        activeBrowser = null;
    }
}

function getScanState() {
    return {
        canResume:
            lastScanState.processedClientIds.size > 0 &&
            (lastScanState.wasCancelled || lastScanState.wasError) &&
            lastScanState.processedClientIds.size < lastScanState.total,
        processedCount: lastScanState.processedClientIds.size,
        total: lastScanState.total,
        errors: lastScanState.errors,
        successes: lastScanState.successes,
        wasCancelled: lastScanState.wasCancelled,
    };
}

function clearScanState() {
    lastScanState = {
        processedClientIds: new Set(),
        wasCancelled: false,
        wasError: false,
        errors: 0,
        successes: 0,
        total: 0,
    };
}

async function run(onStatusUpdate, apiKey, scanConfig = {}, options = {}, deductCredit = null) {
    if (isRunning) {
        onStatusUpdate({ message: 'Tarama zaten devam ediyor.', type: 'error' });
        return;
    }

    isRunning = true;
    scanCancelled = false;

    // Reset daily/hourly counters with monotonic time check
    refreshRateLimits();

    const isResume = options.resume === true;
    const skipClientIds = isResume ? new Set(lastScanState.processedClientIds) : new Set();

    // Reset state for fresh scan, preserve for resume
    if (!isResume) {
        clearScanState();
    }

    // ULTRA-SAFE: Human-like timing to prevent GIB IP blocking
    // A real accountant spends 5-7 minutes per client session.
    // We simulate this by enforcing strict minimums that cannot be overridden.
    const merged = {
        delayMin: 60,
        delayMax: 180,
        batchSize: 10,
        batchPauseMin: 300,
        batchPauseMax: 600,
        maxCaptchaRetries: 2,
        ...scanConfig,
    };
    const config = {
        ...merged,
        delayMin: Math.max(merged.delayMin, 15), // Min 15s between clients
        delayMax: Math.max(merged.delayMax, 30), // Min 30s max delay
        batchSize: Math.min(merged.batchSize, 20), // Max 20 clients per batch
        batchPauseMin: Math.max(merged.batchPauseMin, 60), // Min 1 min batch pause
    };

    const activeClients = database.getClients().filter((c) => c.status === 'active');
    // Prioritize new clients (never scanned) — they need full 3-tab scan
    const newClients = activeClients.filter((c) => !c.last_full_scan_at);
    const existingClients = activeClients.filter((c) => c.last_full_scan_at);
    const allClients = [...newClients, ...existingClients];

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
    const clients = isResume ? allClients.filter((c) => !skipClientIds.has(c.id)) : allClients;

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
            type: 'info',
        });
    } else {
        onStatusUpdate({
            message: `${totalAll} aktif mükellef için tarama başlatılıyor...`,
            type: 'info',
        });
    }

    const alreadyDone = isResume ? skipClientIds.size : 0;
    let successCount = isResume ? lastScanState.successes : 0;
    let errorCount = isResume ? lastScanState.errors : 0;

    onStatusUpdate({
        type: 'progress',
        progress: {
            current: alreadyDone,
            total: totalAll,
            currentClient: null,
            errors: errorCount,
            successes: successCount,
        },
    });

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        activeBrowser = browser;

        for (let i = 0; i < totalRemaining; i++) {
            // Daily limit check
            if (dailyScanCount >= DAILY_CLIENT_LIMIT) {
                onStatusUpdate({
                    message: `Günlük güvenli tarama limiti (${DAILY_CLIENT_LIMIT} mükellef) tamamlandı. Kalan mükellefler yarın taranacak.`,
                    type: 'info',
                });
                lastScanState.wasCancelled = true;
                break;
            }

            // Hourly limit check — wait if needed
            const nowHour = new Date().getHours();
            if (hourlyScanHour !== nowHour) {
                hourlyScanHour = nowHour;
                hourlyScanCount = 0;
            }
            if (hourlyScanCount >= HOURLY_CLIENT_LIMIT) {
                const waitMinutes = 60 - new Date().getMinutes();
                onStatusUpdate({
                    message: `Saatlik güvenli limit (${HOURLY_CLIENT_LIMIT} mükellef). ${waitMinutes} dakika bekleniyor...`,
                    type: 'info',
                });
                // Wait until next hour
                await new Promise((r) => setTimeout(r, waitMinutes * 60 * 1000));
                hourlyScanHour = new Date().getHours();
                hourlyScanCount = 0;
                if (scanCancelled) break;
            }

            if (scanCancelled) {
                lastScanState.wasCancelled = true;
                lastScanState.wasError = false;
                lastScanState.errors = errorCount;
                lastScanState.successes = successCount;
                onStatusUpdate({
                    message: `Tarama durduruldu. (${alreadyDone + i}/${totalAll})`,
                    type: 'info',
                });
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
                    onStatusUpdate({
                        message: 'Kredi yetersiz. Tarama durduruldu.',
                        type: 'error',
                    });
                    onStatusUpdate({
                        type: 'progress',
                        progress: {
                            current: alreadyDone + i,
                            total: totalAll,
                            currentClient: null,
                            errors: errorCount,
                            successes: successCount,
                            insufficientCredits: true,
                        },
                    });
                    break;
                }
            }

            const password = database.getClientPassword(client.id);

            if (!password) {
                onStatusUpdate({
                    message: `${client.firm_name}: Şifre bulunamadı.`,
                    type: 'error',
                    firmId: client.id,
                });
                errorCount++;
                continue;
            }

            // Batch pause (based on processed count in this session)
            if (i > 0 && i % config.batchSize === 0) {
                // Silent batch pause
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
                firmId: client.id,
            });

            onStatusUpdate({
                type: 'progress',
                progress: {
                    current: alreadyDone + i,
                    total: totalAll,
                    currentClient: client.firm_name,
                    errors: errorCount,
                    successes: successCount,
                },
            });

            // Ensure client folder exists even if no tebligat found
            const clientBasePath =
                settings.readSettings().documentsFolder ||
                path.join(app.getPath('userData'), 'documents');
            const clientFolder = path.join(
                clientBasePath,
                (client.firm_name || String(client.id)).replace(/[<>:"/\\|?*]/g, '_').trim()
            );
            ensureDir(clientFolder);

            let succeeded = false;

            for (let attempt = 1; attempt <= config.maxCaptchaRetries; attempt++) {
                if (scanCancelled) break;

                let page;
                try {
                    page = await browser.newPage();
                    await page.setUserAgent(USER_AGENT);
                    await page.setViewport({ width: 1920, height: 1080 });

                    await ensureLoginForm(page);
                    const clientIsFirstScan = !client.last_full_scan_at;
                    const tebligatlar = await loginAndFetch(
                        page,
                        client,
                        password,
                        apiKey,
                        onStatusUpdate,
                        clientIsFirstScan
                    );

                    const count = tebligatlar.length;
                    let savedCount = 0;
                    let newTebligatIds = [];

                    if (count === 0) {
                        // Only create placeholder if client has no tebligat at all
                        const existingCount = database.getTebligatlarByClient(client.id).length;
                        if (existingCount === 0) {
                            const noNotificationRecord = [
                                {
                                    sender: '-',
                                    subject: '-',
                                    documentNo: '-',
                                    status: 'Tebligat yok',
                                    date: new Date().toLocaleDateString('tr-TR'),
                                    endDate: null,
                                    documentUrl: null,
                                    documentPath: null,
                                },
                            ];
                            const saveResult = database.saveTebligatlar(
                                client.id,
                                noNotificationRecord
                            );
                            savedCount = saveResult.inserted;
                        }
                        onStatusUpdate({ type: 'data-updated' });
                        onStatusUpdate({
                            message: `${client.firm_name}: Yeni tebligat bulunamadı.`,
                            type: 'success',
                            firmId: client.id,
                        });
                    } else {
                        const newlyDownloaded = tebligatlar.filter(
                            (t) => t.documentPath && t._newDownload
                        ).length;
                        const alreadyDownloaded = tebligatlar.filter(
                            (t) => t.documentPath && !t._newDownload
                        ).length;
                        const saveResult = database.saveTebligatlar(client.id, tebligatlar);
                        savedCount = saveResult.inserted;
                        newTebligatIds = saveResult.newIds;
                        onStatusUpdate({
                            type: 'data-updated',
                            newTebligatIds,
                            clientId: client.id,
                            clientName: client.firm_name,
                        });

                        const parts = [`${client.firm_name}: ${count} tebligat bulundu`];
                        if (savedCount > 0) parts.push(`${savedCount} yeni kayıt`);
                        if (newlyDownloaded > 0)
                            parts.push(`${newlyDownloaded} yeni döküman indirildi`);
                        if (alreadyDownloaded > 0)
                            parts.push(`${alreadyDownloaded} döküman zaten mevcut`);
                        onStatusUpdate({
                            message: parts.join(', ') + '.',
                            type: 'success',
                            firmId: client.id,
                        });
                    }

                    successCount++;
                    dailyScanCount++;
                    hourlyScanCount++;
                    saveRateLimits();
                    succeeded = true;

                    // Mark first scan complete for this client
                    if (clientIsFirstScan) {
                        database.updateClientScanDate(client.id);
                    }

                    // Mark this client as processed
                    lastScanState.processedClientIds.add(client.id);

                    break;
                } catch (err) {
                    logger.error(
                        `[${client.firm_name}] Deneme ${attempt}/${config.maxCaptchaRetries}:`,
                        err.message
                    );

                    // CRITICAL: IP block detection — stop ALL operations
                    if (err.message === 'GIB_IP_BLOCKED') {
                        onStatusUpdate({
                            message:
                                '⛔ DİKKAT: GİB tarafından IP adresiniz engellenmiş. Tarama durduruluyor. Lütfen GİB ile iletişime geçin.',
                            type: 'error',
                        });
                        scanCancelled = true;
                        if (activeBrowser) {
                            activeBrowser.close().catch(() => {});
                            activeBrowser = null;
                        }
                        isRunning = false;
                        return;
                    }

                    const isCaptchaError =
                        err.message.includes('Captcha') ||
                        err.message.includes('captcha') ||
                        err.message.includes('login sayfasında') ||
                        err.message.includes('Giriş başarısız');

                    if (isCaptchaError && attempt < config.maxCaptchaRetries) {
                        const backoffSec = 5 * Math.pow(2, attempt - 1);
                        // Silent retry — don't expose CAPTCHA details to user
                        await new Promise((r) => setTimeout(r, backoffSec * 1000));
                    } else {
                        break;
                    }
                } finally {
                    if (page) {
                        try {
                            await logoutFromGIB(page);
                        } catch (logoutErr) {
                            logger.debug('[DEBUG] Logout error (ignored):', logoutErr.message);
                        }
                        try {
                            await page.close();
                        } catch (closeErr) {
                            logger.debug('[DEBUG] Page close error (ignored):', closeErr.message);
                        }
                    }
                }
            }

            if (!succeeded) {
                errorCount++;
                dailyScanCount++; // Count failed attempts too — GIB still saw the request
                hourlyScanCount++;
                saveRateLimits();
                lastScanState.processedClientIds.add(client.id);
                onStatusUpdate({
                    message: `${client.firm_name}: Sorgulanamadı. Lütfen kimlik bilgilerini kontrol edin.`,
                    type: 'error',
                    firmId: client.id,
                });
            }
        }
    } catch (error) {
        lastScanState.wasError = true;
        lastScanState.errors = errorCount;
        lastScanState.successes = successCount;
        // Log full error to file for debugging
        logger.debug('[SCAN ERROR]', error?.stack || error?.message || String(error));
        // Report to Sentry with context (technical details)
        if (Sentry) {
            Sentry.captureException(error, {
                tags: {
                    component: 'gib-scraper',
                    phase: 'scan-main',
                    platform: process.platform,
                    arch: process.arch,
                },
                extra: {
                    successCount,
                    errorCount,
                    totalRemaining,
                },
            });
        }
        // Show friendly message to user — technical details go to Sentry only
        onStatusUpdate({
            message:
                'Tarama sırasında beklenmeyen bir hata oluştu. Sorun otomatik olarak bildirildi, en kısa sürede inceleyeceğiz. Lütfen tekrar deneyin.',
            type: 'error',
        });
    } finally {
        activeBrowser = null;
        if (browser) {
            try {
                await browser.close();
            } catch (browserCloseErr) {
                logger.debug('[DEBUG] Browser close error (ignored):', browserCloseErr.message);
            }
        }
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
            completed: allProcessed,
        },
    });

    onStatusUpdate({
        message: allProcessed
            ? `Tarama tamamlandı: ${successCount} başarılı, ${errorCount} hatalı.`
            : `Tarama durdu: ${successCount} başarılı, ${errorCount} hatalı. (${totalAll - lastScanState.processedClientIds.size} mükellef kaldı)`,
        type: successCount > 0 ? 'success' : 'info',
    });

    // Send scan state for UI
    onStatusUpdate({
        type: 'scan-state',
        scanState: getScanState(),
    });
}

// Fetch a single tebligat document on-demand (used when user clicks "Dökümanı Getir")
async function fetchSingleDocument(tebligat, apiKey) {
    const clientId = tebligat.client_id;
    const password = database.getClientPassword(clientId);
    if (!password) throw new Error('Müşteri şifresi bulunamadı');

    const allClients = database.getClients();
    const client = allClients.find((c) => c.id === clientId);
    if (!client) throw new Error('Müşteri bulunamadı');

    const dateStr = tebligat.tebligat_date || null;
    const docsDir = getDocumentsDir(clientId, client.firm_name, dateStr);
    const safeDocNo = (tebligat.document_no || String(tebligat.id)).replace(/[^a-zA-Z0-9-_]/g, '_');
    const baseName = `tebligat_${safeDocNo}`;
    const filePath = path.join(docsDir, `${baseName}.pdf`);

    // Skip if already downloaded (check multiple extensions)
    for (const ext of ['.pdf', '.imz', '.jpg', '.png']) {
        const p = path.join(docsDir, `${baseName}${ext}`);
        if (fs.existsSync(p)) return p;
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);

        // Capture Bearer token from login response
        let bearerToken = null;
        page.on('response', async (resp) => {
            if (resp.url().includes('/apigateway/auth/tdvd/login') && resp.status() === 200) {
                try {
                    const text = await resp.text();
                    const body = JSON.parse(text);
                    if (body.token && body.result !== false) {
                        bearerToken = body.token;
                    }
                } catch {
                    /* consumed */
                }
            }
        });
        page.on('request', (req) => {
            if (
                !bearerToken &&
                req.url().includes('gib.gov.tr/apigateway/') &&
                req.headers()['authorization']
            ) {
                const auth = req.headers()['authorization'];
                if (auth.startsWith('Bearer ')) {
                    bearerToken = auth.substring(7);
                }
            }
        });

        // Login
        await ensureLoginForm(page);
        await page.type('#userid', client.gib_user_code);
        await page.type('#sifre', password);
        const captchaCode = await solveCaptcha(page, apiKey);
        await page.type('#dk', captchaCode);

        const loginSelectors = [
            'button[type="submit"]',
            '#giris',
            'button.MuiButton-containedPrimary',
        ];
        let loggedIn = false;
        for (const selector of loginSelectors) {
            const btn = await page.$(selector);
            if (btn) {
                await Promise.all([
                    page
                        .waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 })
                        .catch(() => {}),
                    page.click(selector),
                ]);
                loggedIn = true;
                break;
            }
        }
        if (!loggedIn) throw new Error('Giriş butonu bulunamadı');

        await new Promise((r) => setTimeout(r, 2000));
        if (page.url().includes('/login')) throw new Error('GIB girişi başarısız');

        // API mode: find matching tebligat and download via HTTP
        if (bearerToken) {
            try {
                const apiClient = gibApiClient.createApiClient(bearerToken);
                const allDtos = await gibApiClient.fetchAllTebligatlar(apiClient);

                // Match by belgeNo (document_no)
                const match = allDtos.find((dto) => dto.belgeNo === tebligat.document_no);
                if (match) {
                    const mapped = gibApiClient.mapTebligatDto(match);
                    const result = await gibApiClient.downloadDocument(apiClient, mapped, filePath);
                    if (result) return result;
                }

                logger.debug('[fetchSingleDocument] No API match found, falling back to Puppeteer');
            } catch (apiErr) {
                logger.debug('[fetchSingleDocument] API failed:', apiErr.message);
            }
        }

        // Fallback: Puppeteer-based DOM download
        await page
            .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                waitUntil: 'networkidle0',
                timeout: 20000,
            })
            .catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));

        const tableSelectors = [
            'table tbody tr',
            '[role="row"]',
            '.MuiDataGrid-row',
            '[class*="MuiDataGrid"] [role="row"]',
        ];
        let foundSelector = null;
        for (const sel of tableSelectors) {
            try {
                await page.waitForSelector(sel, { timeout: 5000 });
                const count = await page.evaluate((s) => document.querySelectorAll(s).length, sel);
                if (count > 0) {
                    foundSelector = sel;
                    break;
                }
            } catch {
                /* try next */
            }
        }
        if (!foundSelector) throw new Error('Tebligat tablosu bulunamadı');

        let found = false;
        for (let pageNum = 0; pageNum < 20 && !found; pageNum++) {
            const matchIndex = await page.evaluate(
                (sel, docNo, sender, subject) => {
                    const rows = Array.from(document.querySelectorAll(sel));
                    for (let i = 0; i < rows.length; i++) {
                        const text = rows[i].innerText || '';
                        if (docNo && text.includes(docNo)) return i;
                        if (sender && subject && text.includes(sender) && text.includes(subject))
                            return i;
                    }
                    return -1;
                },
                foundSelector,
                tebligat.document_no || '',
                tebligat.sender || '',
                tebligat.subject || ''
            );

            if (matchIndex !== -1) {
                found = true;
                logger.debug('[fetchSingleDocument] Found matching row at index:', matchIndex);

                const result = await downloadDocumentByClick(
                    page,
                    matchIndex,
                    foundSelector,
                    filePath
                );
                if (result) return result;
            } else {
                const hasNext = await goToNextPage(page);
                if (!hasNext) break;
                await new Promise((r) => setTimeout(r, 2000));
                await page.waitForSelector(foundSelector, { timeout: 5000 }).catch(() => {});
            }
        }

        return null;
    } finally {
        if (browser) await browser.close();
    }
}

// Apply boundary resets with monotonic time check, sync module-level vars
function refreshRateLimits() {
    const before = {
        dailyScanCount,
        dailyScanDate,
        dailyResetAt,
        hourlyScanCount,
        hourlyScanHour,
        hourlyScanDate: dailyScanDate,
        hourlyResetAt,
        lastSeenTime,
    };
    const after = applyRateLimitResets({ ...before });
    let changed = false;
    if (after.dailyScanCount !== dailyScanCount) {
        dailyScanCount = after.dailyScanCount;
        dailyScanDate = after.dailyScanDate;
        dailyResetAt = after.dailyResetAt;
        changed = true;
    }
    if (after.hourlyScanCount !== hourlyScanCount) {
        hourlyScanCount = after.hourlyScanCount;
        hourlyScanHour = after.hourlyScanHour;
        hourlyResetAt = after.hourlyResetAt;
        changed = true;
    }
    if (changed) saveRateLimits();
}

function getRateLimits() {
    refreshRateLimits();
    return {
        dailyUsed: dailyScanCount,
        dailyLimit: DAILY_CLIENT_LIMIT,
        hourlyUsed: hourlyScanCount,
        hourlyLimit: HOURLY_CLIENT_LIMIT,
    };
}

module.exports = {
    run,
    cancelScan,
    getScanState,
    clearScanState,
    fetchSingleDocument,
    getRateLimits,
};
