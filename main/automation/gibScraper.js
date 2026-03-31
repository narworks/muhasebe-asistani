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

// Download via: "İŞLEM YAP" → "Zarf İçeriği Gör" → detay sayfası → "BELGE GÖRÜNTÜLE"
// Then "← GERİ" to return to the list
const downloadDocumentByClick = async (page, rowIndex, tableSelector, filePath) => {
    let pdfBuffer = null;
    let lastPdfTime = 0;

    const pdfHandler = async (response) => {
        try {
            const ct = response.headers()['content-type'] || '';
            const url = response.url();
            if (
                ct.includes('application/pdf') ||
                ct.includes('application/octet-stream') ||
                url.includes('.pdf')
            ) {
                const buf = await response.buffer();
                if (buf && buf.length > 1000 && (!pdfBuffer || buf.length > pdfBuffer.length)) {
                    pdfBuffer = buf;
                    lastPdfTime = Date.now();
                    logger.debug(`[DL] PDF captured (${buf.length} bytes)`);
                }
            }
        } catch {
            /* buffer consumed */
        }
    };
    page.on('response', pdfHandler);

    try {
        // Step 1: Click "İŞLEM YAP" button on the row
        // The button text is "İŞLEM YAP" with a dropdown arrow, in the last column
        const clicked = await page.evaluate(
            (sel, idx) => {
                const rows = Array.from(document.querySelectorAll(sel));
                const row = rows[idx];
                if (!row) return false;

                // Find button containing "İŞLEM YAP" or "İşlem" text
                const buttons = row.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toUpperCase();
                    if (text.includes('İŞLEM') || text.includes('ISLEM')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            },
            tableSelector,
            rowIndex
        );

        if (!clicked) {
            logger.debug(`[DL] "İŞLEM YAP" button not found in row ${rowIndex}`);
            return null;
        }
        await new Promise((r) => setTimeout(r, 1000));

        // Step 2: Click "Zarf İçeriği Gör" in the dropdown
        const menuClicked = await page.evaluate(() => {
            // Search all visible elements for the menu text
            const allEls = document.querySelectorAll(
                'li, [role="menuitem"], .MuiMenuItem-root, a, span, div'
            );
            for (const el of allEls) {
                const text = (el.textContent || '').trim();
                if (text === 'Zarf İçeriği Gör' || text === 'Zarf İçeriğini Gör') {
                    el.click();
                    return true;
                }
            }
            // Fallback: partial match
            for (const el of allEls) {
                const text = (el.textContent || '').toLowerCase();
                if (text.includes('zarf içeriği')) {
                    el.click();
                    return true;
                }
            }
            return false;
        });

        if (!menuClicked) {
            logger.debug('[DL] "Zarf İçeriği Gör" not found');
            await page.keyboard.press('Escape').catch(() => {});
            return null;
        }

        // Wait for navigation to /tebligat-detay
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));

        // Step 3: Click "BELGE GÖRÜNTÜLE" on the detail page
        const viewClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
                const text = (btn.textContent || '').trim().toUpperCase();
                if (text.includes('BELGE GÖRÜNTÜLE') || text.includes('BELGE GORUNTULE')) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });

        if (!viewClicked) {
            logger.debug('[DL] "BELGE GÖRÜNTÜLE" not found on detail page');
        }

        // Wait for PDF: settle 3s after last capture, max 15s
        const start = Date.now();
        await new Promise((resolve) => {
            const check = setInterval(() => {
                const now = Date.now();
                const elapsed = now - start;
                const settled = lastPdfTime > 0 && now - lastPdfTime >= 3000;
                if (settled || elapsed >= 15000) {
                    clearInterval(check);
                    resolve();
                }
            }, 300);
        });

        // Step 4: Click "← GERİ" to go back to the list
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, a');
            for (const btn of buttons) {
                const text = (btn.textContent || '').trim().toUpperCase();
                if (text.includes('GERİ') || text.includes('GERI')) {
                    btn.click();
                    return;
                }
            }
        });
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    } finally {
        page.off('response', pdfHandler);
    }

    if (pdfBuffer && pdfBuffer.length >= 3000) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, pdfBuffer);
        logger.debug(`[DL] Saved (${pdfBuffer.length} bytes): ${filePath}`);
        return filePath;
    }
    return null;
};

// Module-level state
let scanCancelled = false;
let isRunning = false;

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
const randomDelay = (minSec, maxSec) => {
    const ms = (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
    return new Promise((r) => setTimeout(r, ms));
};

const ensureLoginForm = async (page) => {
    logger.debug('[DEBUG] Navigating to GIB login page:', GIB_LOGIN_URL);
    await page.goto(GIB_LOGIN_URL, { waitUntil: 'networkidle0', timeout: 60000 });
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

    const result = await model.generateContent([
        { text: 'Bu resimdeki metni oku. Sadece metni döndür, boşluksuz. Başka hiçbir şey yazma.' },
        { inlineData: { mimeType: 'image/png', data: captchaBase64 } },
    ]);

    const response = await result.response;
    const captchaText = response.text().trim().replace(/\s/g, '');
    logger.debug('[DEBUG] Gemini solved CAPTCHA:', captchaText);
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
                // cols[offset + 6] = Mükellef (not used in processing)

                // In GİB portal, clicking the row opens the document detail
                // Mark all rows for click-based document access
                const documentUrl = `__CLICK_ROW__:${rowIndex}`;

                return {
                    sender: senderInstitution || subUnit || 'GİB',
                    subject: `${documentType} - ${subUnit}`.trim() || 'Tebligat',
                    documentNo: documentNo,
                    status: 'Yeni', // Will be determined by which tab we're on
                    date: notificationDate || sendDate,
                    sendDate: sendDate,
                    notificationDate: notificationDate,
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

const loginAndFetch = async (page, client, password, apiKey, onStatus = null) => {
    const status = (msg) => {
        if (onStatus) onStatus({ message: `  → ${msg}`, type: 'process', firmId: client.id });
    };

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

    await new Promise((r) => setTimeout(r, 3000));
    const postLoginUrl = page.url();
    logger.debug('[DEBUG] Post-login URL:', postLoginUrl);

    if (postLoginUrl.includes('/login')) {
        throw new Error('Giriş başarısız - CAPTCHA veya kimlik bilgileri yanlış olabilir.');
    }

    // Navigate to E-Tebligat
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
        await new Promise((r) => setTimeout(r, 3000));
        logger.debug('[DEBUG] E-Tebligat page URL:', page.url());
    } else {
        await page
            .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                waitUntil: 'networkidle0',
                timeout: 20000,
            })
            .catch(() => {});
    }

    // Scrape tebligatlar with pagination support
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
        status('Tebligat tablosu bulunamadı.');
        return [];
    }

    // Extract from all pages and download documents while on each page
    const allTebligatlar = [];
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
                const safeDocNo = (tebligat.documentNo || 'doc').replace(/[^a-zA-Z0-9-_]/g, '_');
                const filePath = path.join(docsDir, `tebligat_${safeDocNo}.pdf`);

                // Skip if already downloaded
                if (fs.existsSync(filePath)) {
                    tebligat.documentPath = filePath;
                    continue;
                }

                status(
                    `Döküman indiriliyor (${i + 1}/${pageTebligatlar.length}): ${tebligat.documentNo || '?'}...`
                );

                try {
                    const docPath = await downloadDocumentByClick(page, i, foundSelector, filePath);
                    if (docPath) {
                        tebligat.documentPath = docPath;
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
                    await page.waitForSelector(foundSelector, { timeout: 10000 }).catch(() => {});
                    await new Promise((r) => setTimeout(r, 1000));
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
                    await page.waitForSelector(foundSelector, { timeout: 10000 }).catch(() => {});
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

        // Wait for the page content to update
        await new Promise((r) => setTimeout(r, 1500));

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

    status(`Tarama tamamlandı: ${allTebligatlar.length} tebligat (${pageNum} sayfa).`);
    return allTebligatlar;
};

function cancelScan() {
    scanCancelled = true;
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
        ...scanConfig,
    };

    const allClients = database.getClients().filter((c) => c.status === 'active');

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

        for (let i = 0; i < totalRemaining; i++) {
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

            let succeeded = false;

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
                        onStatusUpdate
                    );

                    const count = tebligatlar.length;
                    let savedCount = 0;

                    if (count === 0) {
                        // Tebligat bulunamadı - "Tebligat yok" kaydı oluştur
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
                        savedCount = database.saveTebligatlar(client.id, noNotificationRecord);
                        onStatusUpdate({
                            message: `${client.firm_name}: Tebligat bulunamadı.`,
                            type: 'success',
                            firmId: client.id,
                        });
                    } else {
                        const downloadedCount = tebligatlar.filter((t) => t.documentPath).length;
                        savedCount = database.saveTebligatlar(client.id, tebligatlar);

                        let message = `${client.firm_name}: ${count} tebligat bulundu, ${savedCount} yeni kayıt eklendi.`;
                        if (downloadedCount > 0) {
                            message += ` (${downloadedCount} döküman indirildi)`;
                        }
                        onStatusUpdate({
                            message,
                            type: 'success',
                            firmId: client.id,
                        });
                    }

                    successCount++;
                    succeeded = true;

                    // Mark this client as processed
                    lastScanState.processedClientIds.add(client.id);

                    break;
                } catch (err) {
                    logger.error(
                        `[${client.firm_name}] Deneme ${attempt}/${config.maxCaptchaRetries}:`,
                        err.message
                    );

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
        onStatusUpdate({
            message: 'Tarama sırasında bir hata oluştu. Lütfen tekrar deneyin.',
            type: 'error',
        });
    } finally {
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
    const fileName = `tebligat_${safeDocNo}.pdf`;
    const filePath = path.join(docsDir, fileName);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
        return filePath;
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);

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

        // Navigate to e-tebligat
        await page
            .goto('https://dijital.gib.gov.tr/portal/e-tebligat', {
                waitUntil: 'networkidle0',
                timeout: 20000,
            })
            .catch(() => {});
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
        if (!foundSelector) throw new Error('Tebligat tablosu bulunamadı');

        // Find matching row across pages
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

module.exports = { run, cancelScan, getScanState, clearScanState, fetchSingleDocument };
