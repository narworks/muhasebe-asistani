const puppeteer = require('puppeteer');
const pLimit = require('p-limit');
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
const gibHttpLogin = require('./gibHttpLogin');
const captchaSolver = require('./captchaSolver');
const tracer = require('./tracer');
const telemetry = require('../telemetry');
let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

// Turkish chars → ASCII for Windows filesystem compatibility
const turkishMap = {
    ş: 's',
    Ş: 'S',
    ğ: 'g',
    Ğ: 'G',
    ı: 'i',
    İ: 'I',
    ü: 'u',
    Ü: 'U',
    ö: 'o',
    Ö: 'O',
    ç: 'c',
    Ç: 'C',
};
const sanitizeFirmName = (name) =>
    (name || '')
        .replace(/[şŞğĞıİüÜöÖçÇ]/g, (c) => turkishMap[c] || c)
        .replace(/[<>:"/\\|?*]/g, '_')
        .trim();

// Get documents directory path (does NOT create it — call ensureDir before saving)
const getDocumentsDir = (clientId, firmName, dateStr) => {
    const s = settings.readSettings();
    const basePath = s.documentsFolder || path.join(app.getPath('userData'), 'documents');

    const safeFirmName = sanitizeFirmName(firmName || String(clientId));

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

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
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
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});

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
// Timestamp when isRunning became true — powers stale-mutex watchdog below.
// 0 when idle; set on every mutex acquire across all entry points via
// acquireRunMutex(); cleared in releaseRunMutex().
let isRunningSince = 0;
let activeBrowser = null;

// Stale mutex watchdog. If a scan crashes without running its cleanup path
// (e.g., Puppeteer process killed by OS, unhandled exception escaping the
// try/finally on some future code path), isRunning stays true and every
// subsequent scan attempt sees "busy" until app restart. The watchdog gives
// us a self-healing path: after 30 minutes — well past any legitimate scan
// duration — we force-release and alert Sentry so we can investigate why the
// cleanup was missed.
const STALE_MUTEX_MS = 30 * 60 * 1000;
setInterval(
    () => {
        if (isRunning && isRunningSince && Date.now() - isRunningSince > STALE_MUTEX_MS) {
            logger.warn(
                `[gibScraper] Stale isRunning mutex detected (${Math.round(
                    (Date.now() - isRunningSince) / 60000
                )}min), force-releasing`
            );
            if (Sentry) {
                Sentry.captureMessage('scraper.stale_mutex_force_release', {
                    level: 'warning',
                    tags: { component: 'gibScraper' },
                    extra: { stuckForMs: Date.now() - isRunningSince },
                });
            }
            isRunning = false;
            isRunningSince = 0;
        }
    },
    5 * 60 * 1000
); // check every 5min

// Rate limiting to prevent GIB IP blocking
const DAILY_CLIENT_LIMIT = 400; // Competitors handle 150-450/day without blocks
const HOURLY_CLIENT_LIMIT = 200; // Single-session capacity (full daily limit in one hour)

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
    scanResults: [], // Per-client results: { clientId, firmName, success, errorType?, errorMessage? }
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
    betweenDocuments: [1, 3], // Between document downloads (API calls within authenticated session)
    betweenPages: [1, 3], // Between pagination
    afterPageLoad: [1, 2], // After page load
    betweenClients: [15, 30], // Between client sessions
    batchPause: [60, 120], // Break between batches
};

/**
 * Classify login failure based on GIB response body.
 * Returns { type, message } where type drives retry strategy:
 * - 'wrong_credentials': don't retry (user error)
 * - 'captcha_failed': retry up to maxCaptchaRetries
 * - 'account_locked': don't retry, needs GIB-side unlock
 * - 'ip_blocked': stop entire scan
 * - 'network_timeout': retry once
 * - 'unknown': retry once
 */
function classifyLoginError(responseBody) {
    // No response body captured at all → likely network timeout / GIB unreachable
    if (!responseBody) {
        return {
            type: 'network_timeout',
            message: 'Ağ hatası — GİB sunucusuna ulaşılamadı',
        };
    }

    // GIB returns { result: false, message: '...', ... } on any failure
    const msg = (responseBody.message || responseBody.errorMessage || '').toLowerCase();

    // Account locked / too many attempts
    if (
        msg.includes('kilitli') ||
        msg.includes('kilitlendi') ||
        msg.includes('çok fazla') ||
        msg.includes('too many') ||
        msg.includes('deneme sayısı') ||
        msg.includes('deneme hakkı')
    ) {
        return {
            type: 'account_locked',
            message: 'Hesap geçici olarak kilitli — GİB çok fazla başarısız deneme tespit etti',
        };
    }

    // Wrong credentials — definitive user error
    if (
        msg.includes('parola') ||
        msg.includes('şifre') ||
        msg.includes('kullanıcı kodu') ||
        msg.includes('kullanıcı adı') ||
        msg.includes('hatalı') ||
        msg.includes('yanlış') ||
        msg.includes('geçersiz') ||
        msg.includes('invalid') ||
        msg.includes('incorrect')
    ) {
        return {
            type: 'wrong_credentials',
            message: 'GİB kullanıcı kodu veya parola hatalı',
        };
    }

    // CAPTCHA failure
    if (msg.includes('captcha') || msg.includes('güvenlik kodu') || msg.includes('doğrulama')) {
        return {
            type: 'captcha_failed',
            message: 'CAPTCHA doğrulama başarısız',
        };
    }

    // IP block (very rare but possible)
    if (msg.includes('engel') || msg.includes('blok') || msg.includes('blocked')) {
        return {
            type: 'ip_blocked',
            message: 'GİB tarafından IP adresi engellenmiş',
        };
    }

    // Unknown failure — likely CAPTCHA but we can't be sure
    return {
        type: 'captcha_failed',
        message: 'Giriş başarısız — nedeni belirlenemedi (muhtemelen CAPTCHA hatası)',
    };
}

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
    await page.goto(GIB_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

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

    // Hybrid: Tesseract local first, Gemini fallback
    const captchaText = await captchaSolver.solveCaptcha(captchaBase64, apiKey);
    logger.debug('[DEBUG] CAPTCHA solved:', captchaText);
    return captchaText;
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
                .waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
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
                    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 })
                    .catch(() => {});
            } else {
                // Strategy 3: Direct logout URL
                logger.debug('[DEBUG] Trying direct logout URL...');
                await page
                    .goto('https://dijital.gib.gov.tr/portal/logout', {
                        waitUntil: 'networkidle2',
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

/**
 * HTTP-only login + API fetch. No Puppeteer needed.
 * ~3-5s login + ~2-5s fetch vs ~30-45s with Puppeteer.
 */
const httpLoginAndFetch = async (
    client,
    password,
    apiKey,
    isFirstScan,
    config,
    onStatusUpdate,
    trace = null
) => {
    const status = (msg) => {
        if (onStatusUpdate)
            onStatusUpdate({ message: `  → ${msg}`, type: 'process', firmId: client.id });
    };

    const loginFn = async () =>
        gibHttpLogin.httpLogin(client.gib_user_code, password, apiKey, config.maxCaptchaRetries);
    const loginResult = trace ? await trace.span('login.http', loginFn) : await loginFn();
    const apiClient = gibApiClient.createApiClient(loginResult.token);

    let allDtos = [];
    if (isFirstScan) {
        status('API ile tüm tebligat geçmişi çekiliyor (ilk tarama)...');
        const fetchBoth = async () => {
            const [nonArchived, archived] = await Promise.all([
                gibApiClient.fetchAllTebligatlar(apiClient),
                gibApiClient.fetchAllTebligatlar(apiClient, { arsivDurum: 1 }),
            ]);
            return [...nonArchived, ...archived];
        };
        allDtos = trace ? await trace.span('api.list_non_archived', fetchBoth) : await fetchBoth();
    } else if (client.last_full_scan_at) {
        status(
            `API: son taramadan (${new Date(client.last_full_scan_at).toLocaleDateString('tr-TR')}) sonraki yeni tebligatlar çekiliyor...`
        );
        const fetchIncr = async () =>
            gibApiClient.fetchAllTebligatlar(apiClient, { sinceDate: client.last_full_scan_at });
        allDtos = trace ? await trace.span('api.list_incremental', fetchIncr) : await fetchIncr();
    } else {
        status('API ile tebligatlar çekiliyor...');
        const fetchSimple = async () => gibApiClient.fetchAllTebligatlar(apiClient);
        allDtos = trace
            ? await trace.span('api.list_non_archived', fetchSimple)
            : await fetchSimple();
    }

    const mapped = allDtos.map(gibApiClient.mapTebligatDto);
    const foundMsg = isFirstScan
        ? `${mapped.length} tebligat bulundu (tam geçmiş).`
        : `${mapped.length} yeni tebligat bulundu.`;
    status(foundMsg);

    if (trace) trace.measurement('docs.found', mapped.length);

    // Filter: skip already-downloaded, skip-marked, and date-filtered tebligatlar
    const toDownload = [];
    let skippedExisting = 0;
    let skippedFilter = 0;
    for (const teb of mapped) {
        const docsDir = getDocumentsDir(
            client.id,
            client.firm_name,
            teb.date || teb.notificationDate || teb.sendDate
        );
        const safeDocNo = (teb.documentNo || 'doc').replace(/[^a-zA-Z0-9-_]/g, '_');
        const baseName = `tebligat_${safeDocNo}`;
        const filePath = path.join(docsDir, `${baseName}.pdf`);

        const existingFile = ['.pdf', '.imz', '.jpg', '.png'].reduce((found, ext) => {
            if (found) return found;
            const p = path.join(docsDir, `${baseName}${ext}`);
            return fs.existsSync(p) ? p : null;
        }, null);

        if (existingFile) {
            teb.documentPath = existingFile;
            teb._newDownload = false;
            skippedExisting++;
            continue;
        }
        if (teb.documentNo && database.isSkipDownload(client.id, teb.documentNo)) {
            teb._newDownload = false;
            skippedFilter++;
            continue;
        }
        if (client.scan_date_filter && teb.date) {
            try {
                const filterDate = new Date(client.scan_date_filter);
                let tebDate;
                const m = String(teb.date).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                if (m) tebDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                else tebDate = new Date(teb.date);
                if (tebDate < filterDate) {
                    teb._newDownload = false;
                    skippedFilter++;
                    continue;
                }
            } catch {
                /* date parse failed, download anyway */
            }
        }
        toDownload.push({ teb, filePath });
    }

    if (trace) {
        trace.measurement('docs.skipped_existing', skippedExisting);
        trace.measurement('docs.skipped_filter', skippedFilter);
    }

    // Parallel download with concurrency limit — 3 concurrent per client
    const limit = pLimit(3);
    let completedDownloads = 0;
    const downloadBatchFn = async () =>
        Promise.all(
            toDownload.map(({ teb, filePath }) =>
                limit(async () => {
                    if (scanCancelled) return;
                    try {
                        const dlPath = await gibApiClient.downloadDocument(
                            apiClient,
                            teb,
                            filePath
                        );
                        if (dlPath) {
                            teb.documentPath = dlPath;
                            teb._newDownload = true;
                        }
                    } catch (dlErr) {
                        logger.debug(`[HTTP DL] ${teb.documentNo}: ${dlErr.message}`);
                    }
                    completedDownloads++;
                    status(
                        `Döküman indirildi (${completedDownloads}/${toDownload.length}): ${teb.documentNo || '?'}`
                    );
                })
            )
        );
    if (trace) await trace.span('download.batch', downloadBatchFn);
    else await downloadBatchFn();

    if (trace) trace.measurement('docs.downloaded', completedDownloads);

    return mapped;
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

    // Capture Bearer token AND login result from GİB response
    let bearerToken = null;
    let loginResponseBody = null; // Holds the parsed login response for error classification
    page.on('response', async (resp) => {
        if (resp.url().includes('/apigateway/auth/tdvd/login') && resp.status() === 200) {
            try {
                const text = await resp.text();
                const body = JSON.parse(text);
                loginResponseBody = body;
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
                    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
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
                .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
                .catch(() => {});
        } else {
            throw new Error('Giriş butonu bulunamadı.');
        }
    }

    await randomDelay(...HUMAN_DELAYS.afterPageLoad);
    const postLoginUrl = page.url();
    logger.debug('[DEBUG] Post-login URL:', postLoginUrl);

    if (postLoginUrl.includes('/login')) {
        // Classify error based on GIB response body
        const errorInfo = classifyLoginError(loginResponseBody);
        const err = new Error(errorInfo.message);
        err.errorType = errorInfo.type;
        throw err;
    }

    // Direct API mode: use HTTP calls instead of Puppeteer scraping (20x faster)
    if (bearerToken) {
        try {
            const apiClient = gibApiClient.createApiClient(bearerToken);

            let allDtos = [];
            if (isFirstScan) {
                status('API ile tüm tebligat geçmişi çekiliyor (ilk tarama)...');
                const [nonArchived, archived] = await Promise.all([
                    gibApiClient.fetchAllTebligatlar(apiClient),
                    gibApiClient.fetchAllTebligatlar(apiClient, { arsivDurum: 1 }),
                ]);
                allDtos = [...nonArchived, ...archived];
            } else if (client.last_full_scan_at) {
                status(
                    `API: son taramadan (${new Date(client.last_full_scan_at).toLocaleDateString('tr-TR')}) sonraki yeni tebligatlar çekiliyor...`
                );
                allDtos = await gibApiClient.fetchAllTebligatlar(apiClient, {
                    sinceDate: client.last_full_scan_at,
                });
            } else {
                status('API ile tebligatlar çekiliyor...');
                allDtos = await gibApiClient.fetchAllTebligatlar(apiClient);
            }

            const mapped = allDtos.map(gibApiClient.mapTebligatDto);
            const foundMsg = isFirstScan
                ? `${mapped.length} tebligat bulundu (tam geçmiş), dökümanlar indiriliyor...`
                : `${mapped.length} yeni tebligat bulundu, dökümanlar indiriliyor...`;
            status(foundMsg);

            // Filter: skip already-downloaded, skip-marked, date-filtered
            const toDownload = [];
            for (const teb of mapped) {
                const docsDir = getDocumentsDir(
                    client.id,
                    client.firm_name,
                    teb.date || teb.notificationDate || teb.sendDate
                );
                const safeDocNo = (teb.documentNo || 'doc').replace(/[^a-zA-Z0-9-_]/g, '_');
                const baseName = `tebligat_${safeDocNo}`;
                const filePath = path.join(docsDir, `${baseName}.pdf`);

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
                if (teb.documentNo && database.isSkipDownload(client.id, teb.documentNo)) {
                    teb._newDownload = false;
                    continue;
                }
                if (client.scan_date_filter && teb.date) {
                    try {
                        const filterDate = new Date(client.scan_date_filter);
                        let tebDate;
                        const m = String(teb.date).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                        if (m) tebDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                        else tebDate = new Date(teb.date);
                        if (tebDate < filterDate) {
                            teb._newDownload = false;
                            continue;
                        }
                    } catch {
                        /* date parse failed, download anyway */
                    }
                }
                toDownload.push({ teb, filePath });
            }

            // Parallel download with 3-concurrent limit per client
            const limit = pLimit(3);
            let completed = 0;
            await Promise.all(
                toDownload.map(({ teb, filePath }) =>
                    limit(async () => {
                        if (scanCancelled) return;
                        try {
                            const dlPath = await gibApiClient.downloadDocument(
                                apiClient,
                                teb,
                                filePath
                            );
                            if (dlPath) {
                                teb.documentPath = dlPath;
                                teb._newDownload = true;
                            }
                        } catch (dlErr) {
                            logger.debug(`[API DL] ${teb.documentNo}: ${dlErr.message}`);
                        }
                        completed++;
                        status(
                            `Döküman indirildi (${completed}/${toDownload.length}): ${teb.documentNo || '?'}`
                        );
                    })
                )
            );

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
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
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
                waitUntil: 'networkidle2',
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
                                    waitUntil: 'networkidle2',
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
                                waitUntil: 'networkidle2',
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
    const safeFirmName = sanitizeFirmName(client.firm_name || String(client.id));
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
        scanResults: [],
    };
}

/**
 * Return the last scan results (per-client detail) for the results modal.
 */
function getLastScanResults() {
    return lastScanState.scanResults || [];
}

async function run(onStatusUpdate, apiKey, scanConfig = {}, options = {}, deductCredit = null) {
    if (isRunning) {
        onStatusUpdate({ message: 'Tarama zaten devam ediyor.', type: 'error' });
        return;
    }

    isRunning = true;
    isRunningSince = Date.now();
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
        delayMin: 18,
        delayMax: 22,
        batchSize: 50,
        batchPauseMin: 60,
        batchPauseMax: 120,
        maxCaptchaRetries: 2,
        ...scanConfig,
    };
    const config = {
        ...merged,
        delayMin: Math.max(merged.delayMin, 10), // Min 10s between clients
        delayMax: Math.max(merged.delayMax, 15), // Min 15s max delay
        batchSize: Math.min(merged.batchSize, 50), // Max 50 clients per batch
        batchPauseMin: Math.max(merged.batchPauseMin, 30), // Min 30s batch pause
    };

    let activeClients = database.getClients().filter((c) => c.status === 'active');

    // Filter by specific client IDs if provided (for "retry failed" flow)
    if (options.clientIds && Array.isArray(options.clientIds) && options.clientIds.length > 0) {
        const idSet = new Set(options.clientIds.map(Number));
        activeClients = activeClients.filter((c) => idSet.has(c.id));
    }

    // Smart priority ordering:
    // 1. New clients (never scanned) — need full historical scan
    // 2. Recently failed clients — retry priority
    // 3. Existing clients — regular incremental
    let newClients = activeClients.filter((c) => !c.last_full_scan_at);
    let existingClients = activeClients.filter((c) => c.last_full_scan_at);

    const recentlyFailed = options.prioritizeFailed
        ? new Set(database.getLastScanFailedClientIds())
        : new Set();
    if (recentlyFailed.size > 0) {
        const failedInExisting = existingClients.filter((c) => recentlyFailed.has(c.id));
        const othersInExisting = existingClients.filter((c) => !recentlyFailed.has(c.id));
        existingClients = [...failedInExisting, ...othersInExisting];
    }

    const allClients = [...newClients, ...existingClients];

    if (allClients.length === 0) {
        onStatusUpdate({ message: 'Tanımlı aktif mükellef bulunamadı.', type: 'info' });
        isRunning = false;
        return;
    }

    // Create scan history entry
    const scanHistoryId = database.createScanHistory(options.scanType || 'full');
    const scanStartTime = Date.now();
    const perClientTraces = []; // collected for telemetry + diag bundle
    let rateLimitWaitMs = 0;
    captchaSolver.resetStats(); // track captcha solver stats for this scan

    // Helper: build progress object with elapsed + estimated remaining
    const buildProgress = (current, total, currentClient, errors, successes, extra = {}) => {
        const elapsed = Math.round((Date.now() - scanStartTime) / 1000);
        const avgPerItem = current > 0 ? elapsed / current : 0;
        const remaining = Math.round(avgPerItem * (total - current));
        return {
            type: 'progress',
            progress: {
                current,
                total,
                currentClient,
                errors,
                successes,
                elapsedSeconds: elapsed,
                estimatedRemainingSeconds: remaining,
                ...extra,
            },
        };
    };

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

    // Track per-client scan results for final report
    const scanResults = isResume ? lastScanState.scanResults || [] : [];
    let consecutiveApiSuccesses = 0; // Track API-only streak for batch pause skip

    onStatusUpdate(buildProgress(alreadyDone, totalAll, null, errorCount, successCount));

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

            // Rate limit check — 10 min cooldown when limit reached
            if (hourlyScanCount >= HOURLY_CLIENT_LIMIT) {
                const COOLDOWN_MINUTES = 10;
                onStatusUpdate({
                    message: `Güvenli limit (${HOURLY_CLIENT_LIMIT} mükellef). ${COOLDOWN_MINUTES} dakika bekleniyor...`,
                    type: 'info',
                });
                const waitStart = Date.now();
                await new Promise((r) => setTimeout(r, COOLDOWN_MINUTES * 60 * 1000));
                rateLimitWaitMs += Date.now() - waitStart;
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

            // Batch pause — skip if all recent clients used API mode (lightweight requests)
            if (i > 0 && i % config.batchSize === 0 && consecutiveApiSuccesses < config.batchSize) {
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
                sanitizeFirmName(client.firm_name || String(client.id))
            );
            ensureDir(clientFolder);

            let succeeded = false;
            let lastErrorType = null;
            let lastErrorMessage = null;
            const clientIsFirstScan = !client.last_full_scan_at;
            const clientTrace = tracer.startClientTrace(client.id);

            // --- HTTP-only login (fast path: ~3-5s vs ~30-45s with Puppeteer) ---
            if (!scanCancelled) {
                try {
                    const httpResult = await httpLoginAndFetch(
                        client,
                        password,
                        apiKey,
                        clientIsFirstScan,
                        config,
                        onStatusUpdate,
                        clientTrace
                    );
                    const tebligatlar = httpResult;

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
                    consecutiveApiSuccesses++;

                    // Mark first scan complete for this client
                    if (clientIsFirstScan) {
                        database.updateClientScanDate(client.id);
                    }

                    // Mark this client as processed
                    lastScanState.processedClientIds.add(client.id);
                } catch (httpErr) {
                    // HTTP login failed — will fall through to Puppeteer
                    logger.debug(
                        `[HTTP-Login] ${client.firm_name}: ${httpErr.errorType || 'error'} — ${httpErr.message}`
                    );

                    // IP block in HTTP mode stops everything too
                    if (httpErr.errorType === 'ip_blocked') {
                        onStatusUpdate({
                            message:
                                '⛔ DİKKAT: GİB tarafından IP adresiniz engellenmiş. Tarama durduruluyor.',
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

                    // Wrong credentials / account locked — no point retrying with Puppeteer
                    if (
                        httpErr.errorType === 'wrong_credentials' ||
                        httpErr.errorType === 'account_locked'
                    ) {
                        lastErrorType = httpErr.errorType;
                        lastErrorMessage = httpErr.message;
                    }
                }
            }

            // --- Puppeteer fallback (only if HTTP path did not succeed) ---
            if (
                !succeeded &&
                !scanCancelled &&
                lastErrorType !== 'wrong_credentials' &&
                lastErrorType !== 'account_locked'
            ) {
                for (let attempt = 1; attempt <= config.maxCaptchaRetries; attempt++) {
                    if (scanCancelled) break;

                    let page;
                    try {
                        page = await browser.newPage();
                        await page.setUserAgent(USER_AGENT);
                        await page.setViewport({ width: 1920, height: 1080 });

                        await ensureLoginForm(page);
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
                        consecutiveApiSuccesses++;
                        if (clientIsFirstScan) database.updateClientScanDate(client.id);
                        lastScanState.processedClientIds.add(client.id);
                        break;
                    } catch (err) {
                        // PII-safe: don't include firm_name in Sentry-forwarded logs
                        logger.debug(
                            `[${client.firm_name}] Deneme ${attempt}/${config.maxCaptchaRetries}:`,
                            err.message
                        );

                        // Determine error type (either from classified login error or legacy patterns)
                        let errorType = err.errorType || null;
                        if (!errorType) {
                            if (err.message === 'GIB_IP_BLOCKED') {
                                errorType = 'ip_blocked';
                            } else if (err.message.includes('Navigation timeout')) {
                                errorType = 'network_timeout';
                            } else if (
                                err.message.toLowerCase().includes('captcha') ||
                                err.message.includes('login sayfasında')
                            ) {
                                errorType = 'captcha_failed';
                            } else if (err.message.includes('Giriş başarısız')) {
                                errorType = 'captcha_failed'; // legacy fallback
                            } else {
                                errorType = 'unknown';
                            }
                        }
                        lastErrorType = errorType;
                        lastErrorMessage = err.message;

                        // CRITICAL: IP block — stop entire scan
                        if (errorType === 'ip_blocked') {
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

                        // Fail-fast for definitive errors — no retry
                        if (errorType === 'wrong_credentials' || errorType === 'account_locked') {
                            break;
                        }

                        // Retry strategies per error type
                        let maxRetry = 1;
                        let backoffSec = 5;
                        if (errorType === 'captcha_failed') {
                            maxRetry = config.maxCaptchaRetries; // 2 retries (3 attempts total)
                            backoffSec = 5 * Math.pow(2, attempt - 1); // 5, 10s
                        } else if (errorType === 'network_timeout') {
                            maxRetry = 1; // 1 retry only
                            backoffSec = 30;
                        } else {
                            maxRetry = 1; // unknown → 1 retry
                            backoffSec = 10;
                        }

                        if (attempt < maxRetry) {
                            await new Promise((r) => setTimeout(r, backoffSec * 1000));
                        } else {
                            break;
                        }
                    } finally {
                        if (page) {
                            try {
                                await page.close();
                            } catch (closeErr) {
                                logger.debug(
                                    '[DEBUG] Page close error (ignored):',
                                    closeErr.message
                                );
                            }
                        }
                    }
                }
            } // end Puppeteer fallback if

            if (!succeeded) {
                errorCount++;
                dailyScanCount++;
                hourlyScanCount++;
                saveRateLimits();
                consecutiveApiSuccesses = 0;
                lastScanState.processedClientIds.add(client.id);

                // Record failed client with error classification
                scanResults.push({
                    clientId: client.id,
                    firmName: client.firm_name,
                    success: false,
                    errorType: lastErrorType || 'unknown',
                    errorMessage: lastErrorMessage || 'Bilinmeyen hata',
                });

                // Friendly message based on error type
                let userMsg;
                switch (lastErrorType) {
                    case 'wrong_credentials':
                        userMsg = `${client.firm_name}: Şifre hatalı — düzeltin`;
                        break;
                    case 'account_locked':
                        userMsg = `${client.firm_name}: Hesap kilitli — 30 dk bekleyin`;
                        break;
                    case 'network_timeout':
                        userMsg = `${client.firm_name}: Bağlantı hatası`;
                        break;
                    case 'captcha_failed':
                        userMsg = `${client.firm_name}: CAPTCHA hatası — daha sonra tekrar deneyin`;
                        break;
                    default:
                        userMsg = `${client.firm_name}: Sorgulanamadı`;
                }
                onStatusUpdate({
                    message: userMsg,
                    type: 'error',
                    firmId: client.id,
                });
            } else {
                // Record successful client
                scanResults.push({
                    clientId: client.id,
                    firmName: client.firm_name,
                    success: true,
                });
            }

            // Finish per-client trace and collect for telemetry
            try {
                const traceResult = clientTrace.finish({
                    success: succeeded,
                    errorType: lastErrorType,
                });
                perClientTraces.push(traceResult);
                // Forward timing to renderer for live display
                onStatusUpdate({ type: 'timing', timing: traceResult });
            } catch {
                /* trace finalization should never break scan */
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

        // Send anonymous telemetry (fire-and-forget, errors are logged but don't block)
        try {
            if (perClientTraces.length > 0) {
                const aggregated = tracer.aggregateTraces(perClientTraces);
                const totalDurationSec = Math.round((Date.now() - scanStartTime) / 1000);
                const hasFirstScan = perClientTraces.some((t) => {
                    const c = activeClients.find((cc) => cc.id === t.clientId);
                    return c && !c.last_full_scan_at;
                });

                // Persist raw per-client timings to scan_history.results_json for diag bundle
                try {
                    database.updateScanHistory(scanHistoryId, {
                        results_json: JSON.stringify({
                            scanResults,
                            timings: perClientTraces,
                            aggregated,
                            rateLimitWaitMs,
                        }),
                    });
                } catch (dbErr) {
                    logger.debug(`[Telemetry] DB persist error: ${dbErr.message}`);
                }

                // Send aggregate to Supabase (fire-and-forget)
                const userId = options.userId || null;
                telemetry
                    .sendScanTelemetry({
                        userId,
                        scanType: options.scanType || 'full',
                        isFirstScan: hasFirstScan,
                        totalDurationSec,
                        aggregated,
                        scanConfig: config,
                        rateLimitWaitMs,
                        captchaStats: captchaSolver.getStats(),
                    })
                    .catch(() => {
                        /* ignore telemetry errors */
                    });
            }
        } catch (telErr) {
            logger.debug(`[Telemetry] Send error (ignored): ${telErr.message}`);
        }

        isRunning = false;
    }

    // Update final state
    lastScanState.errors = errorCount;
    lastScanState.successes = successCount;
    lastScanState.scanResults = scanResults;

    // Record scan history
    try {
        const durationSeconds = Math.round((Date.now() - scanStartTime) / 1000);
        database.updateScanHistory(scanHistoryId, {
            finished_at: new Date().toISOString(),
            total_clients: totalAll,
            success_count: successCount,
            error_count: errorCount,
            new_tebligat_count: 0, // TODO: track during scan
            duration_seconds: durationSeconds,
            results_json: JSON.stringify(scanResults),
        });
    } catch (histErr) {
        logger.debug('[scan-history] update failed:', histErr.message);
    }

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
                        .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
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
                waitUntil: 'networkidle2',
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

/**
 * Login helper: opens puppeteer, logs in, returns { browser, page, bearerToken }.
 * Used by preview and download functions.
 */
async function loginAndGetToken(client, password, apiKey) {
    // Try HTTP-only login first (no browser needed, ~3-5s)
    try {
        const result = await gibHttpLogin.httpLogin(client.gib_user_code, password, apiKey);
        logger.debug(`[loginAndGetToken] HTTP login OK for ${client.gib_user_code}`);
        return { browser: null, page: null, bearerToken: result.token };
    } catch (httpErr) {
        // IP block and credential errors propagate immediately
        if (
            httpErr.errorType === 'ip_blocked' ||
            httpErr.errorType === 'wrong_credentials' ||
            httpErr.errorType === 'account_locked'
        ) {
            throw httpErr;
        }
        logger.debug(
            `[loginAndGetToken] HTTP login failed (${httpErr.errorType}), trying Puppeteer...`
        );
    }

    // Puppeteer fallback
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    let bearerToken = null;
    let loginResponseBody = null;
    page.on('response', async (resp) => {
        if (resp.url().includes('/apigateway/auth/tdvd/login') && resp.status() === 200) {
            try {
                const text = await resp.text();
                const body = JSON.parse(text);
                loginResponseBody = body;
                if (body.token && body.result !== false) bearerToken = body.token;
            } catch {
                /* ignore */
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
            if (auth.startsWith('Bearer ')) bearerToken = auth.substring(7);
        }
    });

    await ensureLoginForm(page);
    await page.type('#userid', client.gib_user_code);
    await page.type('#sifre', password);
    const captchaCode = await solveCaptcha(page, apiKey);
    await page.type('#dk', captchaCode);

    const loginSelectors = ['button[type="submit"]', '#giris', 'button.MuiButton-containedPrimary'];
    for (const selector of loginSelectors) {
        const btn = await page.$(selector);
        if (btn) {
            await Promise.all([
                page
                    .waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 })
                    .catch(() => {}),
                page.click(selector),
            ]);
            break;
        }
    }

    await new Promise((r) => setTimeout(r, 3000));
    if (page.url().includes('/login')) {
        const info = classifyLoginError(loginResponseBody);
        await browser.close();
        const e = new Error(info.message);
        e.errorType = info.type;
        throw e;
    }
    if (!bearerToken) {
        await browser.close();
        const e = new Error('Bearer token yakalanamadı');
        e.errorType = 'unknown';
        throw e;
    }

    return { browser, page, bearerToken };
}

/**
 * Test a single client's login credentials without downloading documents.
 * Used by the "Şifre Test" button.
 * Returns { success, errorType?, errorMessage? }
 */
async function testClientLogin(clientId, apiKey) {
    const password = database.getClientPassword(clientId);
    if (!password) {
        return { success: false, errorType: 'no_password', errorMessage: 'Şifre kayıtlı değil' };
    }
    const client = database.getClients().find((c) => c.id === clientId);
    if (!client) {
        return { success: false, errorType: 'unknown', errorMessage: 'Mükellef bulunamadı' };
    }

    let browser;
    try {
        const result = await loginAndGetToken(client, password, apiKey);
        browser = result.browser;
        return { success: true };
    } catch (err) {
        return {
            success: false,
            errorType: err.errorType || 'unknown',
            errorMessage: err.message,
        };
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {
                /* ignore */
            }
        }
    }
}

/**
 * Preview scan: login + fetch tebligat list for each client.
 * Does NOT download documents. Returns list metadata only.
 */
async function previewScan(onStatusUpdate, apiKey) {
    if (isRunning) {
        onStatusUpdate({ message: 'Tarama zaten devam ediyor.', type: 'error' });
        return { ok: false, error: 'busy' };
    }

    isRunning = true;
    isRunningSince = Date.now();
    scanCancelled = false;
    refreshRateLimits();

    const activeClients = database.getClients().filter((c) => c.status === 'active');
    if (activeClients.length === 0) {
        isRunning = false;
        return { ok: false, error: 'Aktif mükellef yok' };
    }

    const results = [];
    const INTER_CLIENT_DELAY_MIN = 5; // 5-8s between clients (HTTP-only, lightweight)
    const INTER_CLIENT_DELAY_MAX = 8;
    const previewStartTime = Date.now();

    // Helper: build progress for preview with elapsed/estimated
    const buildPreviewProgress = (current, total, currentClient, successes) => {
        const elapsed = Math.round((Date.now() - previewStartTime) / 1000);
        const avgPerItem = current > 0 ? elapsed / current : 0;
        const remaining = Math.round(avgPerItem * (total - current));
        return {
            type: 'progress',
            progress: {
                current,
                total,
                currentClient,
                errors: 0,
                successes,
                elapsedSeconds: elapsed,
                estimatedRemainingSeconds: remaining,
            },
        };
    };

    const CONCURRENCY = 5;
    let completedCount = 0;

    const processOneClient = async (client, index) => {
        if (scanCancelled) return;

        onStatusUpdate({
            message: `[${index + 1}/${activeClients.length}] ${client.firm_name} keşfediliyor...`,
            type: 'process',
            firmId: client.id,
        });

        const password = database.getClientPassword(client.id);
        if (!password) {
            results.push({
                clientId: client.id,
                firmName: client.firm_name,
                ok: false,
                error: 'Şifre yok',
            });
            return;
        }

        let browser;
        try {
            const loginResult = await loginAndGetToken(client, password, apiKey);
            browser = loginResult.browser;
            const { bearerToken } = loginResult;

            const apiClient = gibApiClient.createApiClient(bearerToken);
            const listResp = await apiClient.post('/etebligat/etebligat/tebligat-listele', {
                meta: {
                    pagination: { pageNo: 1, pageSize: 1000 },
                    sortFieldName: 'id',
                    sortType: 'ASC',
                    filters: [],
                },
            });
            const dtoList = listResp.data?.data?.tebligatDtoList || [];
            const count = listResp.data?.data?.count || 0;

            const existingTebligatlar = database.getTebligatlarByClient(client.id);
            const existingDocNos = new Set(
                existingTebligatlar.filter((t) => t.document_path).map((t) => t.document_no)
            );

            const tebligatList = dtoList.map((dto) => ({
                belgeNo: dto.belgeNo,
                sender: dto.kurumAciklama || 'GİB',
                subject: `${dto.belgeTuruAciklama || ''}${dto.altKurum ? ' - ' + dto.altKurum : ''}`,
                sendDate: dto.gonderimZamani,
                notificationDate: dto.tebligZamani,
                status: dto.mukellefOkumaZamani ? 'Okunmuş' : 'Okunmamış',
                _alreadyDownloaded: existingDocNos.has(dto.belgeNo),
                _tebligId: dto.tebligId,
                _tebligSecureId: dto.tebligSecureId,
                _tarafId: dto.tarafId,
                _tarafSecureId: dto.tarafSecureId,
            }));

            results.push({
                clientId: client.id,
                firmName: client.firm_name,
                ok: true,
                count,
                tebligatList,
            });
            onStatusUpdate({
                message: `${client.firm_name}: ${count} tebligat bulundu`,
                type: 'success',
                firmId: client.id,
            });
        } catch (err) {
            if (err.errorType === 'ip_blocked') {
                scanCancelled = true;
                onStatusUpdate({
                    message: '⛔ GİB IP engellemesi — keşif durduruldu.',
                    type: 'error',
                });
                return;
            }
            if (Sentry) {
                Sentry.captureException(err, {
                    tags: { component: 'preview-scan', phase: 'login-or-list' },
                });
            }
            results.push({
                clientId: client.id,
                firmName: client.firm_name,
                ok: false,
                error: err.message,
            });
            onStatusUpdate({
                message: `${client.firm_name}: hata — ${err.message}`,
                type: 'error',
                firmId: client.id,
            });
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch {
                    /* ignore */
                }
            }
            completedCount++;
            const okCount = results.filter((r) => r.ok).length;
            onStatusUpdate(
                buildPreviewProgress(completedCount, activeClients.length, null, okCount)
            );
        }
    };

    try {
        // Process clients with limited concurrency (staggered start)
        const queue = activeClients.map((client, i) => ({ client, index: i }));
        const workers = [];

        for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) {
            const workerFn = async () => {
                while (queue.length > 0 && !scanCancelled) {
                    const item = queue.shift();
                    if (!item) break;
                    await processOneClient(item.client, item.index);
                    if (queue.length > 0 && !scanCancelled) {
                        await randomDelay(INTER_CLIENT_DELAY_MIN, INTER_CLIENT_DELAY_MAX);
                    }
                }
            };
            // Stagger worker starts by 1s each (HTTP-only, lightweight)
            if (w > 0) await new Promise((r) => setTimeout(r, 1000));
            workers.push(workerFn());
        }

        await Promise.all(workers);

        onStatusUpdate({
            type: 'progress',
            progress: {
                current: activeClients.length,
                total: activeClients.length,
                currentClient: null,
                errors: results.filter((r) => !r.ok).length,
                successes: results.filter((r) => r.ok).length,
                completed: true,
            },
        });

        return { ok: true, results };
    } finally {
        isRunning = false;
    }
}

/**
 * Download pre-selected tebligat records.
 * selections: [{ clientId, tebligatList: [{ _tebligId, _tebligSecureId, _tarafId, _tarafSecureId, belgeNo, ... }] }]
 * Each client requires a fresh login (bearer token short-lived).
 */
async function downloadSelectedTebligatlar(onStatusUpdate, apiKey, selections) {
    if (isRunning) {
        onStatusUpdate({ message: 'Tarama zaten devam ediyor.', type: 'error' });
        return { ok: false, error: 'busy' };
    }

    isRunning = true;
    isRunningSince = Date.now();
    scanCancelled = false;
    refreshRateLimits();

    const totalTebligat = selections.reduce((sum, s) => sum + (s.tebligatList?.length || 0), 0);
    let downloadedTotal = 0;
    let errorTotal = 0;

    onStatusUpdate({
        message: `${selections.length} mükellef için ${totalTebligat} tebligat indirilecek`,
        type: 'info',
    });

    try {
        for (let i = 0; i < selections.length; i++) {
            if (scanCancelled) break;

            const sel = selections[i];
            const hasDownloads = sel.tebligatList && sel.tebligatList.length > 0;
            const hasSkips = sel.skippedDocumentNos && sel.skippedDocumentNos.length > 0;
            if (!hasDownloads && !hasSkips) continue;

            // Skip-only path: user chose to skip everything for this client.
            // No login needed — just persist skip marks and mark as scanned.
            if (!hasDownloads && hasSkips) {
                const skippedToSave = sel.skippedDocumentNos.map((docNo) => ({
                    sender: '-',
                    subject: '-',
                    documentNo: docNo,
                    status: 'Atland\u0131',
                    date: null,
                    documentUrl: null,
                    documentPath: null,
                }));
                database.saveTebligatlar(sel.clientId, skippedToSave);
                database.markTebligatlarSkipDownload(sel.clientId, sel.skippedDocumentNos);
                database.updateClientScanDate(sel.clientId);
                onStatusUpdate({
                    message: `${sel.firmName}: ${sel.skippedDocumentNos.length} tebligat atland\u0131`,
                    type: 'success',
                    firmId: sel.clientId,
                });
                continue;
            }

            const allClients = database.getClients();
            const client = allClients.find((c) => c.id === sel.clientId);
            if (!client) continue;

            const password = database.getClientPassword(sel.clientId);
            if (!password) {
                onStatusUpdate({
                    message: `${sel.firmName}: şifre yok, atlanıyor`,
                    type: 'error',
                    firmId: sel.clientId,
                });
                continue;
            }

            onStatusUpdate({
                type: 'progress',
                progress: {
                    current: i + 1,
                    total: selections.length,
                    currentClient: sel.firmName,
                    errors: errorTotal,
                    successes: downloadedTotal,
                },
            });
            onStatusUpdate({
                message: `[${i + 1}/${selections.length}] ${sel.firmName}: ${sel.tebligatList.length} belge indiriliyor...`,
                type: 'process',
                firmId: sel.clientId,
            });

            let browser;
            let attempted = false;
            try {
                const loginResult = await loginAndGetToken(client, password, apiKey);
                browser = loginResult.browser;
                const apiClient = gibApiClient.createApiClient(loginResult.bearerToken);

                // Re-list in the fresh session to get valid secureIds.
                // secureIds from the preview session are bound to that bearer token
                // and return 409 Conflict when reused in a new session.
                const freshDtos = await gibApiClient.fetchAllTebligatlar(apiClient);
                const freshByBelgeNo = new Map();
                for (const dto of freshDtos) {
                    if (dto.belgeNo) freshByBelgeNo.set(dto.belgeNo, dto);
                }

                const newTebligatIds = [];
                const toSave = [];
                let clientDownloaded = 0;
                let clientErrors = 0;

                attempted = sel.tebligatList.length > 0;

                for (let j = 0; j < sel.tebligatList.length; j++) {
                    if (scanCancelled) break;
                    const t = sel.tebligatList[j];
                    const fresh = freshByBelgeNo.get(t.belgeNo);

                    // Convert preview shape to scraper shape (prefer fresh secureIds)
                    const scraperTeb = {
                        sender: t.sender,
                        subject: t.subject,
                        documentNo: t.belgeNo,
                        status: t.status,
                        date: t.notificationDate || t.sendDate,
                        sendDate: t.sendDate,
                        notificationDate: t.notificationDate,
                        readDate: null,
                        documentUrl: null,
                        documentPath: null,
                        tarafId: fresh?.tarafId ?? t._tarafId,
                        tarafSecureId: fresh?.tarafSecureId ?? t._tarafSecureId,
                        tebligId: fresh?.tebligId ?? t._tebligId,
                        tebligSecureId: fresh?.tebligSecureId ?? t._tebligSecureId,
                    };

                    // Download (skip if already exists)
                    const dateStr = scraperTeb.date || null;
                    const docsDir = getDocumentsDir(sel.clientId, sel.firmName, dateStr);
                    const safeDocNo = (t.belgeNo || String(j)).replace(/[^a-zA-Z0-9-_]/g, '_');
                    const baseName = `tebligat_${safeDocNo}`;
                    const filePath = path.join(docsDir, `${baseName}.pdf`);

                    // Check if already downloaded (any extension)
                    let existingPath = null;
                    for (const ext of ['.pdf', '.imz', '.jpg', '.png']) {
                        const p = path.join(docsDir, `${baseName}${ext}`);
                        if (fs.existsSync(p)) {
                            existingPath = p;
                            break;
                        }
                    }

                    if (existingPath) {
                        scraperTeb.documentPath = existingPath;
                        clientDownloaded++;
                        downloadedTotal++;
                    } else {
                        try {
                            const downloaded = await gibApiClient.downloadDocument(
                                apiClient,
                                scraperTeb,
                                filePath
                            );
                            scraperTeb.documentPath = downloaded;
                            clientDownloaded++;
                            downloadedTotal++;
                        } catch (dlErr) {
                            clientErrors++;
                            errorTotal++;
                            logger.debug('[preview-download]', dlErr.message);
                            onStatusUpdate({
                                message: `${sel.firmName}: indirme hatası — ${dlErr.message}`,
                                type: 'error',
                            });
                        }
                    }
                    toSave.push(scraperTeb);

                    // Inter-document delay
                    if (j < sel.tebligatList.length - 1 && !scanCancelled) {
                        await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
                    }
                }

                // Save to database (uses INSERT OR IGNORE so duplicates handled)
                if (toSave.length > 0) {
                    const saveResult = database.saveTebligatlar(sel.clientId, toSave);
                    newTebligatIds.push(...(saveResult.newIds || []));
                    onStatusUpdate({
                        type: 'data-updated',
                        newTebligatIds,
                        clientId: sel.clientId,
                        clientName: sel.firmName,
                    });
                }

                // Mark client as scanned so İlk Keşif knows the user completed discovery.
                // Set regardless of download outcome — otherwise a 409/transient error
                // traps the client in the "new" state forever.
                if (attempted || (sel.skippedDocumentNos && sel.skippedDocumentNos.length > 0)) {
                    database.updateClientScanDate(sel.clientId);
                }

                // Save scan_date_filter if provided (from keşif preset selection)
                if (sel.scanDateFilter) {
                    database.updateClientScanFilter(sel.clientId, sel.scanDateFilter);
                }

                // Mark skipped tebligatlar (those in the full list but not selected for download)
                if (sel.skippedDocumentNos && sel.skippedDocumentNos.length > 0) {
                    // First save them to DB (INSERT OR IGNORE) then mark as skip
                    const skippedToSave = sel.skippedDocumentNos.map((docNo) => ({
                        sender: '-',
                        subject: '-',
                        documentNo: docNo,
                        status: 'Atland\u0131',
                        date: null,
                        documentUrl: null,
                        documentPath: null,
                    }));
                    database.saveTebligatlar(sel.clientId, skippedToSave);
                    database.markTebligatlarSkipDownload(sel.clientId, sel.skippedDocumentNos);
                }

                // Accurate per-client message
                if (clientErrors === 0) {
                    onStatusUpdate({
                        message: `${sel.firmName}: ${clientDownloaded} belge indirildi`,
                        type: 'success',
                        firmId: sel.clientId,
                    });
                } else {
                    onStatusUpdate({
                        message: `${sel.firmName}: ${clientDownloaded} indirildi, ${clientErrors} hatal\u0131`,
                        type: clientDownloaded > 0 ? 'success' : 'error',
                        firmId: sel.clientId,
                    });
                }
            } catch (err) {
                errorTotal++;
                if (Sentry) {
                    Sentry.captureException(err, {
                        tags: { component: 'download-selected' },
                    });
                }
                onStatusUpdate({
                    message: `${sel.firmName}: hata — ${err.message}`,
                    type: 'error',
                    firmId: sel.clientId,
                });
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                    } catch {
                        /* ignore */
                    }
                }
            }

            if (i < selections.length - 1 && !scanCancelled) {
                await randomDelay(8, 12);
            }
        }

        onStatusUpdate({
            type: 'progress',
            progress: {
                current: selections.length,
                total: selections.length,
                currentClient: null,
                errors: errorTotal,
                successes: downloadedTotal,
                completed: true,
            },
        });

        return { ok: true, downloaded: downloadedTotal, errors: errorTotal };
    } finally {
        isRunning = false;
    }
}

/**
 * Scan a single client — used by daemon scheduler for continuous background scanning.
 * Fast path: HTTP-only login + incremental fetch (only tebligat since last scan).
 * Returns: { success, newTebligatCount, errorType?, errorMessage?, durationMs, trace }
 */
async function scanSingleClient(clientId, apiKey, options = {}) {
    // Serialize against full-scan run() — both paths share GIB session state,
    // Gemini API quota, and rate limit counters. Running concurrently causes
    // GIB to invalidate one session when the other logs in, and doubles
    // CAPTCHA API costs for the same credentials. Return "busy" so daemon
    // tick skips and retries on next interval rather than hanging.
    if (isRunning) {
        return {
            success: false,
            errorType: 'busy',
            errorMessage: 'Başka bir tarama devam ediyor, bu mükellef atlanıyor',
        };
    }

    const client = database.getClients().find((c) => c.id === clientId);
    if (!client) {
        return {
            success: false,
            errorType: 'client_not_found',
            errorMessage: 'Mükellef bulunamadı',
        };
    }
    if (client.status !== 'active') {
        return {
            success: false,
            errorType: 'client_inactive',
            errorMessage: 'Mükellef aktif değil',
        };
    }

    const password = database.getClientPassword(clientId);
    if (!password) {
        return { success: false, errorType: 'no_password', errorMessage: 'Şifre bulunamadı' };
    }

    const scanConfig = settings.readSettings().scan || {};
    const config = {
        delayMin: 18,
        delayMax: 22,
        batchSize: 50,
        batchPauseMin: 60,
        batchPauseMax: 120,
        maxCaptchaRetries: 2,
        ...scanConfig,
    };

    const clientIsFirstScan = !client.last_full_scan_at;
    const trace = tracer.startClientTrace(client.id);
    const startTime = Date.now();

    const statusCb = options.onStatusUpdate || (() => {});

    isRunning = true;
    isRunningSince = Date.now();
    try {
        const tebligatlar = await httpLoginAndFetch(
            client,
            password,
            apiKey,
            clientIsFirstScan,
            config,
            statusCb,
            trace
        );

        let savedCount = 0;
        let newTebligatIds = [];
        if (tebligatlar.length > 0) {
            const saveResult = database.saveTebligatlar(client.id, tebligatlar);
            savedCount = saveResult.inserted;
            newTebligatIds = saveResult.newIds;
        }

        // Mark first scan complete (if applicable) and update daemon scan timestamp
        if (clientIsFirstScan) {
            database.updateClientScanDate(client.id);
        }
        database.updateClientDaemonScan(client.id);
        database.refreshRecentTebligatCount(client.id);

        const result = trace.finish({ success: true });

        // Send telemetry for this single-client scan (fire-and-forget)
        try {
            const aggregated = tracer.aggregateTraces([result]);
            telemetry
                .sendScanTelemetry({
                    userId: options.userId || null,
                    scanType: options.telemetryType || 'daemon_tick',
                    isFirstScan: clientIsFirstScan,
                    totalDurationSec: Math.round((Date.now() - startTime) / 1000),
                    aggregated,
                    scanConfig: config,
                    rateLimitWaitMs: 0,
                    captchaStats: captchaSolver.getStats(),
                })
                .catch(() => {});
        } catch {
            /* ignore telemetry errors */
        }

        return {
            success: true,
            newTebligatCount: savedCount,
            newTebligatIds,
            durationMs: Date.now() - startTime,
            trace: result,
            client: { id: client.id, firm_name: client.firm_name },
        };
    } catch (err) {
        const errorType = err.errorType || 'unknown';
        const result = trace.finish({ success: false, errorType });

        // IP block → propagate so daemon can pause
        if (errorType === 'ip_blocked') {
            if (Sentry) {
                Sentry.captureException(err, {
                    tags: { component: 'daemon-scan', errorType: 'ip_blocked' },
                });
            }
        }

        return {
            success: false,
            errorType,
            errorMessage: err.message,
            durationMs: Date.now() - startTime,
            trace: result,
            client: { id: client.id, firm_name: client.firm_name },
        };
    } finally {
        isRunning = false;
    }
}

module.exports = {
    run,
    cancelScan,
    getScanState,
    clearScanState,
    fetchSingleDocument,
    getRateLimits,
    previewScan,
    downloadSelectedTebligatlar,
    testClientLogin,
    getLastScanResults,
    sanitizeFirmName,
    scanSingleClient,
};
