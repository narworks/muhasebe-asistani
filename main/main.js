const {
    app,
    BrowserWindow,
    ipcMain,
    Tray,
    Menu,
    nativeImage,
    dialog,
    shell,
    powerSaveBlocker,
    screen,
} = require('electron');
const fs = require('fs');
const ExcelJS = require('exceljs');
const path = require('path');
const Sentry = require('@sentry/electron/main');

// Tell Puppeteer where to find the bundled Chromium binary in production
if (app.isPackaged) {
    // process.resourcesPath points to the app's Resources folder where extraResources land
    process.env.PUPPETEER_CACHE_DIR = path.join(process.resourcesPath, 'puppeteer-cache');
}

// In production: use build-time generated config. In dev: use .env via dotenv.
if (app.isPackaged) {
    try {
        const envConfig = require('./env-config');
        Object.entries(envConfig).forEach(([key, value]) => {
            if (value && !process.env[key]) process.env[key] = value;
        });
    } catch {
        console.error('env-config.js not found — run "node scripts/build-env.js" before building.');
    }
} else {
    require('dotenv').config({
        path: path.join(__dirname, '../.env'),
    });
}

// Sentry init — must come after env loading, before any error-prone code
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: `muhasebe-asistani@${app.getVersion()}`,
        environment: app.isPackaged ? 'production' : 'development',
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        beforeSend(event) {
            // Strip user identification
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
                delete event.user.username;
            }
            // Redact 10/11-digit numbers (TC/VKN) from exception messages
            if (event.exception?.values) {
                for (const ex of event.exception.values) {
                    if (ex.value) {
                        ex.value = ex.value.replace(/\b\d{10,11}\b/g, '[REDACTED]');
                    }
                }
            }
            return event;
        },
    });
    // Send a startup ping so we can verify Sentry connectivity per launch
    Sentry.captureMessage(`App started v${app.getVersion()}`, {
        level: 'info',
        tags: {
            event_type: 'app-startup',
            platform: process.platform,
            arch: process.arch,
        },
    });
} else {
    console.warn('[Sentry] SENTRY_DSN not set, error tracking disabled');
}

const logger = require('./logger');

// Log rotation: rotate error.log when it exceeds 5MB
const MAX_ERROR_LOG_SIZE = 5 * 1024 * 1024;
const appendErrorLog = (logPath, logEntry) => {
    try {
        const stats = fs.statSync(logPath);
        if (stats.size > MAX_ERROR_LOG_SIZE) {
            const bakPath = logPath + '.bak';
            if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
            fs.renameSync(logPath, bakPath);
        }
    } catch {
        /* file doesn't exist yet — fine */
    }
    fs.appendFileSync(logPath, logEntry);
};

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error.message);
    console.error(error.stack);
    const logPath = path.join(app.getPath('userData'), 'error.log');
    const timestamp = new Date().toISOString();
    appendErrorLog(logPath, `[${timestamp}] UNCAUGHT: ${error.message}\n${error.stack}\n\n`);
});

process.on('unhandledRejection', (reason, _promise) => {
    console.error('[ERROR] Unhandled Promise Rejection:', reason);
    const logPath = path.join(app.getPath('userData'), 'error.log');
    const timestamp = new Date().toISOString();
    appendErrorLog(logPath, `[${timestamp}] UNHANDLED_REJECTION: ${reason}\n\n`);
});
const supabase = require('./supabase');
const licenseManager = require('./license');
const database = require('./database');
const gibScraper = require('./automation/gibScraper');
const statementConverter = require('./automation/statementConverter');
const settings = require('./settings');
const scheduler = require('./scheduler');
const validation = require('./validation');
const autoUpdater = require('./autoUpdater');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;
let tray = null;
let isQuitting = false;

const createWindow = () => {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow({
        width: Math.min(Math.round(screenW * 0.85), 1600),
        height: Math.min(Math.round(screenH * 0.9), 1100),
        minWidth: 1024,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Open all external links in system browser instead of new Electron window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // On macOS: minimize to tray. On Windows/Linux: quit fully to avoid zombie processes
    mainWindow.on('close', (event) => {
        if (!isQuitting && process.platform === 'darwin') {
            event.preventDefault();
            mainWindow.hide();
        } else {
            isQuitting = true;
        }
    });
};

// Helper: run scan with status updates
const runScanWithUpdates = async () => {
    if (!licenseManager.hasModuleAccess('e_tebligat')) {
        logger.debug('[Scheduler] Skipping scan - e_tebligat module not active');
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        logger.debug('[Scheduler] Skipping scan - no API key');
        return;
    }

    const scanConfig = settings.readSettings().scan || {};

    // Kredi düşme callback'i (zamanlı tarama için)
    const deductCredit = async () => {
        const result = await licenseManager.deductCredits(1, 'e_tebligat_scan');
        if (result.success && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }
        return result;
    };

    try {
        await gibScraper.run(
            (status) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-update', status);
                }
            },
            apiKey,
            scanConfig,
            {},
            deductCredit
        );

        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scan-complete', 'Tarama tamamlandı.');
        }
    } catch (error) {
        console.error('Scan error:', error);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scan-error', 'Tarama hatası: ' + error.message);
        }
    }
};

app.whenReady().then(() => {
    // Supabase'i başlat
    try {
        supabase.init();
    } catch (error) {
        console.error('Supabase initialization failed:', error.message);
        app.quit();
        return;
    }

    database.init();
    licenseManager.init();
    licenseManager.checkLicense();

    // Initialize scheduler
    scheduler.init(() => runScanWithUpdates());

    createWindow();

    // Initialize auto-updater
    autoUpdater.init(mainWindow);

    // IPC: start downloading update
    ipcMain.handle('start-update-download', () => {
        autoUpdater.startDownload();
    });

    // IPC: restart and install update
    ipcMain.handle('restart-and-update', () => {
        autoUpdater.quitAndInstall();
    });

    // System tray
    const trayIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABjSURBVDiNY/j//z8DCjAxMDAwMDIy/mdgYGBgAmH8gImBgYGBiRCfkYGBgQlfIBMxBjAxMjL+JxTNROvCxMjI+B9fNBMDmBgYGBhIjUamhw8fUu4FYgNqJSNKk9F/Ag4BAOqQFBETnp7LAAAAAElFTkSuQmCC'
    );
    tray = new Tray(trayIcon);
    const trayMenu = Menu.buildFromTemplate([
        {
            label: 'Aç',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        { type: 'separator' },
        {
            label: 'Çıkış',
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
    tray.setToolTip('Muhasebe Asistanı');
    tray.setContextMenu(trayMenu);
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on('before-quit', () => {
    isQuitting = true;
    // Destroy tray so app can fully exit (needed for auto-update)
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('window-all-closed', () => {
    if (isQuitting) {
        app.quit();
    }
    // Otherwise stay in tray for scheduled scans
});

// --- IPC HANDLERS ---

// Auth & Subscription
ipcMain.handle('login', async (event, credentials) => {
    return await licenseManager.login(credentials);
});

ipcMain.handle('logout', async () => {
    return await licenseManager.logout();
});

ipcMain.handle('check-license', async () => {
    return await licenseManager.checkLicense();
});

ipcMain.handle('get-subscription-status', async () => {
    return licenseManager.getSubscriptionStatus();
});

ipcMain.handle('get-user-info', async () => {
    return licenseManager.getUserInfo();
});

// Start Scan (fresh)
ipcMain.on('start-scan', async (event) => {
    if (!licenseManager.hasModuleAccess('e_tebligat')) {
        event.reply('scan-error', 'E-Tebligat modülü aktif değil. Lütfen abone olun.');
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        event.reply('scan-error', 'Sistem yapılandırma hatası. Lütfen destek ile iletişime geçin.');
        return;
    }

    const scanConfig = settings.readSettings().scan || {};

    // Kredi düşme callback'i oluştur
    const deductCredit = async () => {
        const result = await licenseManager.deductCredits(1, 'e_tebligat_scan');
        if (result.success && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }
        return result;
    };

    // Prevent system sleep during scan
    const sleepBlockId = powerSaveBlocker.start('prevent-app-suspension');
    logger.debug(`[Scan] Sleep blocker started: ${sleepBlockId}`);

    try {
        await gibScraper.run(
            (status) => {
                if (!mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-update', status);
                }
            },
            apiKey,
            scanConfig,
            {},
            deductCredit
        );

        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        console.error('Scan error:', error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
    } finally {
        // Allow sleep again
        if (powerSaveBlocker.isStarted(sleepBlockId)) {
            powerSaveBlocker.stop(sleepBlockId);
            logger.debug('[Scan] Sleep blocker stopped');
        }
    }
});

// Resume Scan (continue from where stopped)
ipcMain.on('resume-scan', async (event) => {
    if (!licenseManager.hasModuleAccess('e_tebligat')) {
        event.reply('scan-error', 'E-Tebligat modülü aktif değil. Lütfen abone olun.');
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        event.reply('scan-error', 'Sistem yapılandırma hatası. Lütfen destek ile iletişime geçin.');
        return;
    }

    const scanConfig = settings.readSettings().scan || {};

    // Kredi düşme callback'i
    const deductCredit = async () => {
        const result = await licenseManager.deductCredits(1, 'e_tebligat_scan');
        if (result.success && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }
        return result;
    };

    const sleepBlockId = powerSaveBlocker.start('prevent-app-suspension');

    try {
        await gibScraper.run(
            (status) => {
                if (!mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-update', status);
                }
            },
            apiKey,
            scanConfig,
            { resume: true },
            deductCredit
        );

        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        console.error('Resume scan error:', error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
    } finally {
        if (powerSaveBlocker.isStarted(sleepBlockId)) {
            powerSaveBlocker.stop(sleepBlockId);
        }
    }
});

// Rate limits
ipcMain.handle('get-rate-limits', () => {
    return gibScraper.getRateLimits();
});

// Cancel Scan
ipcMain.on('cancel-scan', (event) => {
    gibScraper.cancelScan();
    event.reply('scan-update', { message: 'Tarama durdurma isteği gönderildi...', type: 'info' });
});

// Scan State (for resume)
ipcMain.handle('get-scan-state', () => {
    return gibScraper.getScanState();
});

// Legal consent
ipcMain.handle('get-legal-consent', () => {
    return settings.readSettings().legalConsentAccepted || false;
});

ipcMain.handle('accept-legal-consent', () => {
    settings.updateSettings({ legalConsentAccepted: true });
    return { success: true };
});

// Scan Settings
ipcMain.handle('get-scan-settings', () => {
    return settings.readSettings().scan || {};
});

ipcMain.handle('save-scan-settings', (event, scanSettings) => {
    validation.validateScanSettings(scanSettings);
    settings.updateSettings({ scan: scanSettings });
    return { success: true };
});

// Schedule Management
ipcMain.handle('get-schedule-status', () => {
    return scheduler.getStatus();
});

ipcMain.handle('set-schedule', (event, config) => {
    const {
        enabled,
        time,
        finishByTime,
        startAtTime,
        frequency = 'daily',
        customDays = [],
    } = config;
    validation.validateScheduleConfig(config);
    const targetTime = finishByTime || time;
    if (enabled && (targetTime || startAtTime)) {
        const success = scheduler.startSchedule(
            targetTime,
            frequency,
            customDays,
            startAtTime || null
        );
        return { success };
    } else {
        scheduler.stopSchedule();
        return { success: true };
    }
});

// Credits
ipcMain.handle('get-credits', () => {
    return licenseManager.getCredits();
});

ipcMain.handle('sync-credits', async () => {
    return await licenseManager.syncCredits();
});

ipcMain.handle('purchase-credits', async () => {
    const billingUrl = licenseManager.getBillingUrl();
    const userInfo = licenseManager.getUserInfo();

    // Build URL with parameters
    const params = new URLSearchParams();
    params.set('source', 'desktop'); // Enable compact mode
    params.set('package', 'credit-1000');
    if (userInfo?.email) params.set('email', userInfo.email);

    const url = `${billingUrl}?${params.toString()}`;

    const billingWindow = new BrowserWindow({
        width: 450,
        height: 550,
        parent: mainWindow,
        modal: true,
        title: 'Kredi Satın Al',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    billingWindow.loadURL(url);
    billingWindow.on('closed', async () => {
        await licenseManager.syncCredits();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }
    });

    return { success: true };
});

// Database IPCs
ipcMain.handle('get-clients', (_event) => {
    return database.getClients();
});

ipcMain.handle('save-client', async (event, clientData) => {
    validation.validateClientData(clientData);

    // Check client limit via Supabase
    const { userId } = licenseManager.getUserInfo();
    if (userId) {
        const { allowed, totalAdded, maxClients } = await supabase.checkClientLimit(userId);
        if (!allowed) {
            throw new Error(
                `Mükellef limitinize ulaştınız (${totalAdded}/${maxClients}). Ek mükellef paketi almak için Abonelik sayfasını ziyaret edin.`
            );
        }
    }

    const result = database.saveClient(clientData);

    // Increment counter in Supabase (fire-and-forget, don't block save)
    if (userId) {
        supabase.incrementClientCount(userId).catch((err) => {
            logger.debug('[save-client] incrementClientCount error:', err.message);
        });
    }

    // Refresh schedule when client count changes
    scheduler.refreshSchedule();
    return result;
});

ipcMain.handle('get-client-limit', async () => {
    const { userId } = licenseManager.getUserInfo();
    if (!userId) return { totalAdded: 0, maxClients: 200, remaining: 200 };
    const { totalAdded, maxClients } = await supabase.checkClientLimit(userId);
    return { totalAdded, maxClients, remaining: maxClients - totalAdded };
});

ipcMain.handle('update-client', (event, id, clientData) => {
    const validId = validation.validateId(id, 'Müşteri ID');
    validation.validateClientData(clientData);
    return database.updateClient(validId, clientData);
});

ipcMain.handle('update-client-status', (event, id, status) => {
    const validId = validation.validateId(id, 'Müşteri ID');
    const validStatus = validation.validateStatus(status);
    const result = database.updateClientStatus(validId, validStatus);
    // Refresh schedule when client status changes (affects active count)
    scheduler.refreshSchedule();
    return result;
});

ipcMain.handle('delete-client', (event, id) => {
    const validId = validation.validateId(id, 'Müşteri ID');
    const result = database.deleteClient(validId);
    // Refresh schedule when client count changes
    scheduler.refreshSchedule();
    return result;
});

// Excel'den toplu mükellef importı
ipcMain.handle('import-clients-from-excel', async (event, fileBuffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(fileBuffer));
    const worksheet = workbook.worksheets[0];

    const clients = [];
    const parseErrors = [];

    worksheet.eachRow((row, rowNumber) => {
        const values = row.values.slice(1).map((v) => (v != null ? String(v).trim() : ''));

        // İlk satırı header olarak atla
        if (rowNumber === 1) {
            return;
        }

        const [firmName, taxNumber, gibUserCode, gibPassword] = values;

        if (!firmName) {
            parseErrors.push({ row: rowNumber, error: 'Firma adı boş' });
            return;
        }

        clients.push({
            firm_name: firmName,
            tax_number: taxNumber || null,
            gib_user_code: gibUserCode || null,
            gib_password: gibPassword || null,
        });
    });

    // Check client limit before bulk save
    const { userId } = licenseManager.getUserInfo();
    if (userId) {
        const { allowed, totalAdded, maxClients } = await supabase.checkClientLimit(userId);
        const remaining = maxClients - totalAdded;
        if (!allowed || clients.length > remaining) {
            return {
                saved: 0,
                errors: [],
                parseErrors,
                limitError: `Mükellef limitiniz yetersiz. Kalan: ${remaining}, Eklenmek istenen: ${clients.length}. Ek mükellef paketi almak için Abonelik sayfasını ziyaret edin.`,
            };
        }
    }

    const results = database.bulkSaveClients(clients);

    // Increment Supabase counter for successfully saved clients
    if (userId && results.saved > 0) {
        for (let i = 0; i < results.saved; i++) {
            supabase.incrementClientCount(userId).catch(() => {});
        }
    }

    scheduler.refreshSchedule();
    return { ...results, parseErrors };
});

ipcMain.handle('get-tebligatlar', () => {
    return database.getTebligatlar();
});

// Delete a single tebligat and its downloaded document
ipcMain.handle('delete-tebligat', async (event, tebligatId) => {
    try {
        const tebligat = database.getTebligatById(tebligatId);
        if (tebligat && tebligat.document_path && fs.existsSync(tebligat.document_path)) {
            fs.unlinkSync(tebligat.document_path);
        }
        database.deleteTebligat(tebligatId);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Delete all tebligatlar and documents for a specific client
ipcMain.handle('delete-client-history', async (event, clientId) => {
    try {
        // Get all tebligatlar for this client to find document paths
        const tebligatlar = database.getTebligatlarByClient(clientId);

        // Delete downloaded documents
        const docPaths = new Set();
        for (const t of tebligatlar) {
            if (t.document_path && fs.existsSync(t.document_path)) {
                fs.unlinkSync(t.document_path);
                docPaths.add(path.dirname(t.document_path));
            }
        }

        // Clean up empty directories
        for (const dir of docPaths) {
            try {
                if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
                    fs.rmdirSync(dir);
                }
            } catch {
                /* ignore */
            }
        }

        // Also clean up the firm's documents folder
        const clients = database.getClients();
        const client = clients.find((c) => c.id === clientId);
        if (client) {
            const settings = require('./settings');
            const s = settings.readSettings();
            const basePath = s.documentsFolder || path.join(app.getPath('userData'), 'documents');
            const safeFirmName = (client.firm_name || String(clientId))
                .replace(/[<>:"/\\|?*]/g, '_')
                .trim();
            const firmDir = path.join(basePath, safeFirmName);
            if (fs.existsSync(firmDir)) {
                fs.rmSync(firmDir, { recursive: true, force: true });
            }
        }

        // Delete tebligat records from database
        database.deleteTebligatlarByClient(clientId);
        return { success: true, deletedCount: tebligatlar.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Statement Converter
ipcMain.handle('convert-statement', async (event, data) => {
    const { fileBuffer, mimeType, prompt } = data;
    logger.debug('[convert-statement] mimeType:', mimeType);
    validation.validateStatementInput(data);

    if (!licenseManager.hasModuleAccess('excel_assistant')) {
        throw new Error('Excel Asistanı modülü aktif değil. Lütfen abone olun.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Sistem yapılandırma hatası. Lütfen destek ile iletişime geçin.');
    }

    // Kredi kontrolü ve düşme (5 kredi)
    const creditResult = await licenseManager.deductCredits(5, 'statement_convert');
    if (!creditResult.success) {
        if (creditResult.error === 'insufficient_credits') {
            throw new Error(
                `Yetersiz kredi. Bu işlem 5 kredi gerektirir. Kalan krediniz: ${creditResult.totalRemaining || 0}`
            );
        }
        throw new Error('Kredi kontrolü başarısız.');
    }

    try {
        const result = await statementConverter.convert(
            Buffer.from(fileBuffer),
            mimeType,
            prompt,
            apiKey
        );

        // Kredi güncelleme bildirimini gönder
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }

        return result;
    } catch (error) {
        // Başarısız dönüştürmede kredi iadesi
        await licenseManager.refundCredits(5, 'statement_convert');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('credits-updated', licenseManager.getCredits());
        }
        throw error;
    }
});

// Checkout Page - Direct payment
ipcMain.handle('open-checkout', async (event, params) => {
    const { plan, period, email, name, phone } = params;

    const urlParams = new URLSearchParams();
    urlParams.set('plan', plan);
    urlParams.set('period', period);
    urlParams.set('email', email);
    urlParams.set('name', name);
    if (phone) urlParams.set('phone', phone);

    const billingBase = process.env.BILLING_URL || 'https://muhasebeasistani.com/billing';
    const checkoutUrl = `${billingBase}/checkout?${urlParams.toString()}`;

    const checkoutWindow = new BrowserWindow({
        width: 520,
        height: 700,
        parent: mainWindow,
        modal: true,
        resizable: true,
        title: 'Güvenli Ödeme',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    logger.debug('[Checkout] Opening:', checkoutUrl);
    checkoutWindow.loadURL(checkoutUrl);
    checkoutWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
        logger.debug('[Checkout] Load failed:', errorCode, errorDesc, validatedURL);
    });
    checkoutWindow.on('closed', async () => {
        await licenseManager.checkLicense();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('subscription-updated');
        }
    });

    return { success: true };
});

// Billing Portal
ipcMain.handle('open-billing-portal', async (event, packageId) => {
    const billingUrl = licenseManager.getBillingUrl();
    const userInfo = licenseManager.getUserInfo();

    // Build URL with parameters
    const params = new URLSearchParams();
    params.set('source', 'desktop'); // Enable compact mode
    params.set('v', Date.now().toString()); // Cache buster
    if (packageId) params.set('package', packageId);
    if (userInfo?.email) params.set('email', userInfo.email);
    if (userInfo?.name) params.set('name', userInfo.name);

    const url = `${billingUrl}?${params.toString()}`;

    const billingWindow = new BrowserWindow({
        width: 420,
        height: 480,
        parent: mainWindow,
        modal: true,
        resizable: false,
        title: 'Abonelik Satın Al',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    billingWindow.loadURL(url);
    billingWindow.on('closed', async () => {
        await licenseManager.checkLicense();
        // Notify renderer about potential subscription changes
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('subscription-updated');
        }
    });

    return { success: true };
});

ipcMain.handle('open-forgot-password', async () => {
    const siteBase = (process.env.BILLING_URL || 'https://muhasebeasistani.com/billing').replace(
        /\/billing\/?$/,
        ''
    );
    const forgotPasswordUrl = `${siteBase}/forgot-password`;
    const forgotWindow = new BrowserWindow({
        width: 480,
        height: 420,
        parent: mainWindow,
        modal: true,
        resizable: false,
        title: 'Şifremi Unuttum',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    forgotWindow.loadURL(forgotPasswordUrl);
    return { success: true };
});

// Export to CSV
ipcMain.handle('export-csv', async (event, { data, defaultFileName }) => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'CSV olarak kaydet',
        defaultPath: defaultFileName || 'export.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    try {
        // Add BOM for UTF-8 Excel compatibility
        const BOM = '\uFEFF';
        fs.writeFileSync(filePath, BOM + data, 'utf8');
        return { success: true, filePath };
    } catch (error) {
        console.error('CSV export error:', error);
        return { success: false, error: error.message };
    }
});

// Export to Excel
ipcMain.handle('export-excel', async (event, { rows, sheetName, defaultFileName }) => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Excel olarak kaydet',
        defaultPath: defaultFileName || 'export.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet(sheetName || 'Sheet1');

        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            ws.columns = headers.map((header) => {
                let maxWidth = header.length;
                rows.forEach((row) => {
                    const value = String(row[header] || '');
                    maxWidth = Math.max(maxWidth, value.length);
                });
                return { header, key: header, width: Math.min(maxWidth + 2, 50) };
            });
            rows.forEach((row) => ws.addRow(row));
        }

        await workbook.xlsx.writeFile(filePath);

        return { success: true, filePath };
    } catch (error) {
        console.error('Excel export error:', error);
        return { success: false, error: error.message };
    }
});

// Open document (PDF, etc.) — auto-extract PDF from .imz if needed
ipcMain.handle('open-document', async (event, documentPath) => {
    if (!documentPath) {
        return { success: false, error: 'Döküman yolu belirtilmedi.' };
    }

    if (!fs.existsSync(documentPath)) {
        return { success: false, error: 'Döküman bulunamadı.' };
    }

    try {
        let pathToOpen = documentPath;

        // .imz files can't be opened directly — extract PDF first
        if (documentPath.toLowerCase().endsWith('.imz')) {
            const pdfPath = documentPath.replace(/\.imz$/i, '.pdf');
            if (fs.existsSync(pdfPath)) {
                pathToOpen = pdfPath;
            } else {
                const { extractPdfFromImz } = require('./automation/gibApiClient');
                const extracted = extractPdfFromImz(documentPath);
                if (extracted) {
                    pathToOpen = extracted;
                    database.updateTebligatDocumentByPath(documentPath, extracted);
                }
            }
        }

        await shell.openPath(pathToOpen);
        return { success: true };
    } catch (error) {
        console.error('Open document error:', error);
        return { success: false, error: error.message };
    }
});

// Share document (show in folder)
ipcMain.handle('share-document', async (event, documentPath) => {
    if (!documentPath) {
        return { success: false, error: 'Döküman yolu belirtilmedi.' };
    }

    if (!fs.existsSync(documentPath)) {
        return { success: false, error: 'Döküman bulunamadı.' };
    }

    try {
        shell.showItemInFolder(documentPath);
        return { success: true };
    } catch (error) {
        console.error('Share document error:', error);
        return { success: false, error: error.message };
    }
});

// Open documents folder
ipcMain.handle('open-documents-folder', async () => {
    const s = settings.readSettings();
    const documentsPath = s.documentsFolder || path.join(app.getPath('userData'), 'documents');

    // Create folder if it doesn't exist
    if (!fs.existsSync(documentsPath)) {
        fs.mkdirSync(documentsPath, { recursive: true });
    }

    try {
        await shell.openPath(documentsPath);
        return { success: true, path: documentsPath };
    } catch (error) {
        console.error('Open documents folder error:', error);
        return { success: false, error: error.message };
    }
});

// Get documents folder path
ipcMain.handle('get-documents-path', () => {
    const s = settings.readSettings();
    return s.documentsFolder || path.join(app.getPath('userData'), 'documents');
});

// Select documents folder via native dialog
ipcMain.handle('select-documents-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Döküman Klasörünü Seçin',
        properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
        return { success: false };
    }

    const folderPath = result.filePaths[0];
    settings.updateSettings({ documentsFolder: folderPath });
    return { success: true, path: folderPath };
});

// Get documents folder setting
ipcMain.handle('get-documents-folder', () => {
    const s = settings.readSettings();
    return s.documentsFolder || null;
});

// Fetch a single tebligat document on-demand
ipcMain.handle('fetch-tebligat-document', async (event, tebligatId) => {
    const tebligat = database.getTebligatById(tebligatId);
    if (!tebligat) {
        return { success: false, error: 'Tebligat bulunamadı' };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { success: false, error: 'Sistem yapılandırma hatası' };
    }

    // Retry up to 3 times with exponential backoff for rate limit errors
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const docPath = await gibScraper.fetchSingleDocument(tebligat, apiKey);
            if (docPath) {
                database.updateTebligatDocument(tebligatId, docPath);
                return { success: true, path: docPath };
            }
            return {
                success: false,
                error: 'Döküman bulunamadı. GIB portalında bu belge mevcut olmayabilir.',
            };
        } catch (err) {
            const isRateLimit =
                err.message.includes('429') ||
                err.message.includes('Rate') ||
                err.message.includes('exhausted');

            if (isRateLimit && attempt < maxRetries) {
                const waitSec = 30 * attempt; // 30s, 60s, 90s
                logger.debug(
                    `[fetch-doc] Rate limited, retry ${attempt}/${maxRetries} in ${waitSec}s`
                );
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }

            logger.error('fetch-tebligat-document error:', err.message);
            let userMessage = 'Döküman indirilemedi. Lütfen daha sonra tekrar deneyin.';
            if (isRateLimit) {
                userMessage =
                    'Çok fazla istek gönderildi. Lütfen birkaç dakika bekleyip tekrar deneyin.';
            } else if (err.message.includes('Giriş başarısız') || err.message.includes('CAPTCHA')) {
                userMessage = 'GIB portalına giriş yapılamadı. Lütfen daha sonra tekrar deneyin.';
            }
            return { success: false, error: userMessage };
        }
    }
});
