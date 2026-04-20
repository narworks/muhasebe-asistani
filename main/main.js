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
// Per-session error deduplication — don't spam Sentry with same error
const _sentSentryFingerprints = new Map(); // fingerprint -> timestamp
const SENTRY_DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: `muhasebe-asistani@${app.getVersion()}`,
        environment: app.isPackaged ? 'production' : 'development',
        sendDefaultPii: false,
        tracesSampler: (ctx) => {
            // Sample 100% of GIB scan transactions (bounded by tiny volume),
            // 10% of everything else. This gives us per-user scan performance data
            // without burning through Sentry's free tier quota.
            const name = ctx.transactionContext?.name || ctx.name || '';
            if (name.startsWith('gib.scan')) return 1.0;
            return 0.1;
        },
        beforeSend(event) {
            // Strip user identification
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
                delete event.user.username;
            }
            // Also strip geo data (city/region) — still identifying
            if (event.user?.geo) {
                delete event.user.geo;
            }

            // PII scrub function — applies multiple redaction patterns
            const scrub = (text) => {
                if (!text || typeof text !== 'string') return text;
                return (
                    text
                        // TC/VKN (10 or 11 digit numbers)
                        .replace(/\b\d{10,11}\b/g, '[REDACTED-ID]')
                        // Email addresses
                        .replace(
                            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
                            '[REDACTED-EMAIL]'
                        )
                        // Turkish uppercase company names in brackets: [FIRMA ADI]
                        .replace(/\[[A-ZĞÜŞİÖÇ][A-ZĞÜŞİÖÇ0-9\s.&]{2,}\]/g, '[REDACTED-FIRM]')
                );
            };

            // Scrub exception messages
            if (event.exception?.values) {
                for (const ex of event.exception.values) {
                    if (ex.value) ex.value = scrub(ex.value);
                }
            }
            // Scrub top-level message (captureMessage calls)
            if (event.message) {
                event.message = scrub(event.message);
            }
            // Scrub breadcrumbs (HTTP requests, user interactions)
            if (event.breadcrumbs) {
                for (const b of event.breadcrumbs) {
                    if (b.message) b.message = scrub(b.message);
                    if (b.data) {
                        for (const key of Object.keys(b.data)) {
                            if (typeof b.data[key] === 'string') {
                                b.data[key] = scrub(b.data[key]);
                            }
                        }
                    }
                }
            }
            // Scrub extra data
            if (event.extra) {
                for (const key of Object.keys(event.extra)) {
                    if (typeof event.extra[key] === 'string') {
                        event.extra[key] = scrub(event.extra[key]);
                    }
                }
            }

            // Deduplication: drop if same error sent within last hour
            const fp = event.exception?.values?.[0]
                ? `${event.exception.values[0].type}:${event.exception.values[0].value}`
                : event.message;
            if (fp) {
                const now = Date.now();
                const lastSent = _sentSentryFingerprints.get(fp);
                if (lastSent && now - lastSent < SENTRY_DEDUPE_WINDOW_MS) {
                    return null; // Drop event
                }
                _sentSentryFingerprints.set(fp, now);
                // Cleanup old entries
                for (const [key, ts] of _sentSentryFingerprints) {
                    if (now - ts > SENTRY_DEDUPE_WINDOW_MS) {
                        _sentSentryFingerprints.delete(key);
                    }
                }
            }
            return event;
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
const daemonScheduler = require('./daemonScheduler');
const validation = require('./validation');
const autoUpdater = require('./autoUpdater');

const getCheckoutBaseUrl = () => {
    const raw = process.env.BILLING_URL || 'https://muhasebeasistani.com/billing';
    return raw.replace(/\/(pricing|billing)\/?$/, '/billing');
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;
let daemonPopupWindow = null;
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

    // Minimize to tray on all platforms (daemon continues running in background).
    // "Çıkış" menu item sets isQuitting=true to allow actual quit.
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        } else {
            isQuitting = true;
        }
    });

    // Hide dock / taskbar icon when window is hidden → true menu-bar-app behavior
    mainWindow.on('hide', () => {
        if (process.platform === 'darwin' && app.dock) {
            app.dock.hide();
        } else if (process.platform === 'win32') {
            mainWindow.setSkipTaskbar(true);
        }
    });

    mainWindow.on('show', () => {
        if (process.platform === 'darwin' && app.dock) {
            app.dock.show();
        } else if (process.platform === 'win32') {
            mainWindow.setSkipTaskbar(false);
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

/**
 * Create the daemon popup window — small, frameless, shown near tray icon.
 * Hidden by default; toggled by tray click.
 */
const createDaemonPopup = () => {
    daemonPopupWindow = new BrowserWindow({
        width: 380,
        height: 540,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: false,
        vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    // Load same app but on the /daemon-popup route
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        daemonPopupWindow.loadURL(`${devUrl}#/daemon-popup`);
    } else {
        daemonPopupWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
            hash: '/daemon-popup',
        });
    }

    // Close when clicked outside
    daemonPopupWindow.on('blur', () => {
        if (daemonPopupWindow && !daemonPopupWindow.isDestroyed()) {
            daemonPopupWindow.hide();
        }
    });

    daemonPopupWindow.on('closed', () => {
        daemonPopupWindow = null;
    });
};

/**
 * Position popup near tray icon and show it. Hide if already visible.
 */
const toggleDaemonPopup = (trayBounds) => {
    if (!daemonPopupWindow || daemonPopupWindow.isDestroyed()) {
        createDaemonPopup();
    }

    if (daemonPopupWindow.isVisible()) {
        daemonPopupWindow.hide();
        return;
    }

    // Position: macOS → below tray icon; Windows/Linux → near taskbar
    const winBounds = daemonPopupWindow.getBounds();
    let x, y;

    if (process.platform === 'darwin' && trayBounds) {
        // macOS menu bar: center popup under tray icon
        x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
        y = Math.round(trayBounds.y + trayBounds.height + 4);
    } else if (process.platform === 'win32' && trayBounds) {
        // Windows taskbar (usually bottom): show above tray
        x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
        y = Math.round(trayBounds.y - winBounds.height - 4);
    } else {
        // Fallback: top-right of primary display
        const display = screen.getPrimaryDisplay();
        x = display.workAreaSize.width - winBounds.width - 20;
        y = 40;
    }

    // Clamp to screen bounds
    const display = screen.getDisplayNearestPoint({ x: x + winBounds.width / 2, y });
    x = Math.max(
        display.workArea.x + 4,
        Math.min(x, display.workArea.x + display.workArea.width - winBounds.width - 4)
    );
    y = Math.max(
        display.workArea.y + 4,
        Math.min(y, display.workArea.y + display.workArea.height - winBounds.height - 4)
    );

    daemonPopupWindow.setPosition(x, y, false);
    daemonPopupWindow.show();
    daemonPopupWindow.focus();
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

    // Schedule disk usage background refresh
    try {
        require('./diskUsage').scheduleBackgroundRefresh();
    } catch (err) {
        logger.debug(`[diskUsage] init error: ${err.message}`);
    }

    // Initialize scheduler
    scheduler.init(() => runScanWithUpdates());

    createWindow();

    // If launched hidden at login, keep dock hidden
    try {
        const wasLaunchedAtLogin =
            process.platform === 'darwin' &&
            app.getLoginItemSettings().wasOpenedAtLogin &&
            app.getLoginItemSettings().wasOpenedAsHidden;
        if (wasLaunchedAtLogin && mainWindow) {
            mainWindow.hide();
            if (app.dock) app.dock.hide();
        }
    } catch {
        /* ignore */
    }

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

    // System tray — dedicated template icon for macOS (auto-tints to menu bar color),
    // colored version for Windows/Linux.
    let trayIcon;
    try {
        const isMac = process.platform === 'darwin';
        const iconName = isMac ? 'trayIconTemplate.png' : 'trayIcon.png';
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, iconName)
            : path.join(__dirname, '..', 'build', iconName);
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) throw new Error(`${iconName} not found`);
        if (isMac) {
            // Tell macOS this is a template image — it will render in menu bar
            // color (white/dark mode, black/light mode) automatically.
            trayIcon.setTemplateImage(true);
        }
    } catch (err) {
        logger.debug(`[Tray] icon load error: ${err.message}, using inline fallback`);
        // Fallback: inline simple template (black M on transparent)
        trayIcon = nativeImage.createFromDataURL(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAy0lEQVRYhe3XMQrCQBCF4f8lJmAjWFtYWlh4AC/gFTyAF/AA3sDKwsLCQgsLC0UQBCvBQhBBBBGEgIrBZJ1iEpIVNom7mxFy4JF5b+bN7uwMK3KJpJykBTAERpJWkuaAG0R5M5IyST5JGUnGk4BDkraShgx+DlBJGgC3gH/dAb/KwAOYxfRngLnHDyJMIsK5px8OAE44A8YB7wLgEkGeOwBnz98AXB2AZ4AGEaVgO4APAs0OQPYbYdgB4wOvCLg5AFeAMUl5AHkJWAKNlKR/ACZZHvVVCxpLAAAAAElFTkSuQmCC'
        );
        if (process.platform === 'darwin') trayIcon.setTemplateImage(true);
    }
    tray = new Tray(trayIcon);
    const updateTrayMenu = () => {
        const daemonState = daemonScheduler.getState();
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
                label: daemonState.running
                    ? daemonState.paused
                        ? '⏸ Arka Plan Tarama: Duraklatıldı'
                        : '🟢 Arka Plan Tarama: Aktif'
                    : '⚪ Arka Plan Tarama: Kapalı',
                enabled: false,
            },
            {
                label: `Bu oturum: ${daemonState.stats.successes}/${daemonState.stats.totalScans} başarılı`,
                enabled: false,
            },
            { type: 'separator' },
            {
                label: daemonState.running ? 'Duraklat (1 saat)' : 'Başlat',
                click: () => {
                    if (daemonState.running) daemonScheduler.pause(60 * 60 * 1000);
                    else
                        daemonScheduler.start((event) => {
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('daemon-event', event);
                            }
                            updateTrayMenu();
                        });
                    updateTrayMenu();
                },
            },
            { type: 'separator' },
            {
                label: 'Çıkış',
                click: () => {
                    isQuitting = true;
                    daemonScheduler.stop();
                    app.quit();
                },
            },
        ]);
        // Store menu reference for manual popup on right-click — avoids
        // setContextMenu() which conflicts with our click handler on macOS.
        tray._contextMenu = trayMenu;
    };
    tray.setToolTip('Muhasebe Asistanı');
    updateTrayMenu();

    // Left-click: toggle popup dashboard
    tray.on('click', (_event, bounds) => {
        toggleDaemonPopup(bounds);
    });
    // Double-click: open main window
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
    // Right-click: context menu (manual popup; avoids conflict with setContextMenu)
    tray.on('right-click', () => {
        if (tray._contextMenu) tray.popUpContextMenu(tray._contextMenu);
    });

    // Start background daemon (only after user login — but module not required for now)
    // Daemon auto-checks module access and settings at tick time
    const daemonSettings = (settings.readSettings() || {}).daemon || {};
    if (daemonSettings.enabled !== false) {
        daemonScheduler.start((event) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('daemon-event', event);
            }
            updateTrayMenu();
        });
    }

    // Auto-launch on OS boot (configurable)
    try {
        const autoLaunchEnabled = daemonSettings.autoLaunch !== false;
        app.setLoginItemSettings({
            openAtLogin: autoLaunchEnabled,
            openAsHidden: true, // Start minimized to tray
        });
    } catch (err) {
        logger.debug(`[AutoLaunch] setLoginItemSettings error: ${err.message}`);
    }

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
    // Lazy-refresh diagnostic flag on user info query
    try {
        await licenseManager.syncDiagnosticFlag();
    } catch {
        /* ignore, fall back to cached value */
    }
    return licenseManager.getUserInfo();
});

// Start Scan with options (clientIds filter, prioritizeFailed)
ipcMain.on('start-scan-with-options', async (event, scanOptions) => {
    if (!licenseManager.hasModuleAccess('e_tebligat')) {
        event.reply('scan-error', 'E-Tebligat modülü aktif değil. Lütfen abone olun.');
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        event.reply('scan-error', 'Sistem yapılandırma hatası.');
        return;
    }

    const scanConfig = settings.readSettings().scan || {};
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
            scanOptions || {},
            deductCredit
        );
        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        logger.error('[start-scan-with-options] error:', error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
    } finally {
        if (powerSaveBlocker.isStarted(sleepBlockId)) powerSaveBlocker.stop(sleepBlockId);
    }
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

// Preview scan — login + list only, no document download
ipcMain.handle('preview-scan', async (_event) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { ok: false, error: 'Sistem yapılandırma hatası' };
    const blockId = powerSaveBlocker.start('prevent-app-suspension');
    try {
        return await gibScraper.previewScan((status) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scan-update', status);
            }
        }, apiKey);
    } catch (err) {
        logger.error('[preview-scan] error:', err);
        return { ok: false, error: err.message };
    } finally {
        if (powerSaveBlocker.isStarted(blockId)) powerSaveBlocker.stop(blockId);
    }
});

// Download selected tebligatlar from preview
ipcMain.handle('download-selected-tebligatlar', async (event, selections) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { ok: false, error: 'Sistem yapılandırma hatası' };
    const blockId = powerSaveBlocker.start('prevent-app-suspension');
    try {
        return await gibScraper.downloadSelectedTebligatlar(
            (status) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-update', status);
                }
            },
            apiKey,
            selections
        );
    } catch (err) {
        logger.error('[download-selected] error:', err);
        return { ok: false, error: err.message };
    } finally {
        if (powerSaveBlocker.isStarted(blockId)) powerSaveBlocker.stop(blockId);
    }
});

// Test a single client's login credentials
ipcMain.handle('test-client-login', async (_event, clientId) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { success: false, errorType: 'unknown', errorMessage: 'Sistem yapılandırma hatası' };
    }
    try {
        return await gibScraper.testClientLogin(clientId, apiKey);
    } catch (err) {
        logger.error('[test-client-login] error:', err);
        return {
            success: false,
            errorType: 'unknown',
            errorMessage: err.message || 'Bilinmeyen hata',
        };
    }
});

// Return the last scan's per-client results for the summary modal
ipcMain.handle('get-last-scan-results', async () => {
    try {
        return { ok: true, results: gibScraper.getLastScanResults() };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// Scan history list
ipcMain.handle('get-scan-history', async (_event, limit) => {
    try {
        const rows = database.getScanHistory(limit || 50);
        // Parse results_json safely
        return rows.map((r) => {
            let results = [];
            if (r.results_json) {
                try {
                    results = JSON.parse(r.results_json);
                } catch {
                    /* ignore */
                }
            }
            return {
                id: r.id,
                startedAt: r.started_at,
                finishedAt: r.finished_at,
                scanType: r.scan_type,
                totalClients: r.total_clients,
                successCount: r.success_count,
                errorCount: r.error_count,
                newTebligatCount: r.new_tebligat_count,
                durationSeconds: r.duration_seconds,
                results,
            };
        });
    } catch (err) {
        logger.error('[get-scan-history] error:', err);
        return [];
    }
});

// Export diagnostic bundle for a specific scan (PII-safe JSON for developer support)
ipcMain.handle('export-diag-bundle', async (_event, scanHistoryId) => {
    try {
        const diagBundle = require('./diagBundle');
        return await diagBundle.exportBundle(scanHistoryId);
    } catch (err) {
        logger.error('[export-diag-bundle] error:', err);
        return { saved: false, reason: err.message };
    }
});

// Daemon settings IPC
ipcMain.handle('daemon-get-settings', async () => {
    const s = settings.readSettings() || {};
    return s.daemon || {};
});

ipcMain.handle('daemon-update-settings', async (_event, newSettings) => {
    const current = settings.readSettings() || {};
    const merged = { ...(current.daemon || {}), ...newSettings };
    settings.updateSettings({ daemon: merged });

    // Apply autoLaunch immediately if changed
    if (typeof newSettings.autoLaunch === 'boolean') {
        try {
            app.setLoginItemSettings({
                openAtLogin: newSettings.autoLaunch,
                openAsHidden: true,
            });
        } catch (err) {
            logger.debug(`[daemon-update-settings] autoLaunch error: ${err.message}`);
        }
    }

    // Start/stop daemon if enabled changed
    if (newSettings.enabled === false) {
        daemonScheduler.stop();
    } else if (newSettings.enabled === true) {
        daemonScheduler.start((event) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('daemon-event', event);
            }
        });
    }

    return { ok: true, settings: merged };
});

// Daemon scheduler IPC
ipcMain.handle('daemon-get-state', async () => daemonScheduler.getState());

ipcMain.handle('daemon-start', async () => {
    daemonScheduler.start((event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('daemon-event', event);
        }
    });
    return { ok: true };
});

ipcMain.handle('daemon-stop', async () => {
    daemonScheduler.stop();
    return { ok: true };
});

ipcMain.handle('daemon-pause', async (_event, durationMs) => {
    daemonScheduler.pause(durationMs || 60 * 60 * 1000);
    return { ok: true };
});

ipcMain.handle('daemon-resume', async () => {
    daemonScheduler.resume();
    return { ok: true };
});

// Disk usage for documents folder
ipcMain.handle('get-disk-usage', async (_event, forceRefresh) => {
    try {
        const diskUsage = require('./diskUsage');
        return diskUsage.getDiskUsage(forceRefresh === true);
    } catch (err) {
        logger.debug(`[get-disk-usage] error: ${err.message}`);
        return { totalMB: null, fileCount: null, freeDiskMB: null };
    }
});

// Recent tebligatlar for daemon popup
ipcMain.handle('get-recent-tebligatlar', async (_event, limit) => {
    try {
        return database.getRecentTebligatlar(limit || 5);
    } catch (err) {
        logger.debug(`[get-recent-tebligatlar] error: ${err.message}`);
        return [];
    }
});

// Open main window (from daemon popup)
ipcMain.handle('open-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
    }
    if (daemonPopupWindow && !daemonPopupWindow.isDestroyed()) {
        daemonPopupWindow.hide();
    }
    return { ok: true };
});

// Scan a single client on demand (right-click → "Şimdi Tara")
ipcMain.handle('scan-single-client', async (_event, clientId) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, errorMessage: 'API anahtarı yok' };
    try {
        const result = await gibScraper.scanSingleClient(clientId, apiKey, {
            onStatusUpdate: (status) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('scan-update', status);
                }
            },
        });
        return result;
    } catch (err) {
        return { success: false, errorMessage: err.message };
    }
});

// Get last failed client IDs (for "retry failed" button)
ipcMain.handle('get-last-scan-failed-ids', async () => {
    try {
        return database.getLastScanFailedClientIds();
    } catch {
        return [];
    }
});

// Estimate scan duration for given client count (for pre-scan tooltip)
ipcMain.handle('estimate-scan-duration', async (_event, clientCount) => {
    try {
        const count =
            clientCount ?? database.getClients().filter((c) => c.status === 'active').length;
        // Match gibScraper config: delayMin 15s, delayMax 30s, batchSize 20, batchPauseMin 60s
        const avgDelay = 22; // seconds between clients
        const avgBatchPause = 90; // seconds
        const timePerClient = 45; // login + captcha + fetch
        const batchCount = Math.max(0, Math.floor((count - 1) / 20));
        const seconds = count * timePerClient + (count - 1) * avgDelay + batchCount * avgBatchPause;
        // Add 20% buffer
        const bufferedMinutes = Math.ceil((seconds * 1.2) / 60);
        return { count, estimatedMinutes: bufferedMinutes };
    } catch (err) {
        return { count: 0, estimatedMinutes: 0, error: err.message };
    }
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

// Excel şablon indirme
ipcMain.handle('download-excel-template', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
        title: 'Şablonu Kaydet',
        defaultPath: 'mukellef-sablonu.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return { success: false };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mükellefler');

    const expectedHeaders = ['Firma Adı', 'Vergi Numarası', 'GİB Kullanıcı Kodu', 'GİB Şifresi'];
    ws.columns = expectedHeaders.map((h) => ({ header: h, width: h === 'Firma Adı' ? 30 : 20 }));

    // Header stili
    const headerRow = ws.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.protection = { locked: true };
    });

    // Header hücre açıklamaları (tooltip)
    ws.getCell('A1').note = 'Zorunlu alan. Firma veya şahıs adını yazın.';
    ws.getCell('B1').note = 'Opsiyonel. 10 veya 11 haneli vergi/TC kimlik numarası.';
    ws.getCell('C1').note =
        'GİB portalına giriş için kullanıcı kodu (genellikle vergi numarası ile aynı).';
    ws.getCell('D1').note = 'GİB portalı şifresi. Bu bilgi yalnızca bilgisayarınızda saklanır.';

    // Örnek satır (gri italik — import sırasında otomatik atlanır)
    const exRow = ws.addRow(['Örnek Firma Ltd. Şti.', '1234567890', '1234567890', 'sifre123']);
    exRow.eachCell((cell) => {
        cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
        cell.protection = { locked: false };
    });

    // Veri girişi yapılacak satırlar (2-201) için doğrulama kuralları
    const dataRange = 201;

    // B sütunu: Vergi numarası — sadece rakam, 10-11 hane
    for (let r = 2; r <= dataRange; r++) {
        ws.getCell(`B${r}`).dataValidation = {
            type: 'textLength',
            operator: 'between',
            showErrorMessage: true,
            errorTitle: 'Geçersiz Vergi Numarası',
            error: 'Vergi numarası 10 veya 11 haneli olmalıdır.',
            formulae: [10, 11],
        };
    }

    // C sütunu: GİB kullanıcı kodu — metin uzunluğu
    for (let r = 2; r <= dataRange; r++) {
        ws.getCell(`C${r}`).dataValidation = {
            type: 'textLength',
            operator: 'between',
            showErrorMessage: true,
            errorTitle: 'Geçersiz Kullanıcı Kodu',
            error: 'GİB kullanıcı kodu 10-11 karakter olmalıdır.',
            formulae: [10, 11],
        };
    }

    // Veri satırları kilit açık, boş hücreler düzenlenebilir
    for (let r = 2; r <= dataRange; r++) {
        ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
            cell.protection = { locked: false };
        });
    }

    // Sayfayı koru — header kilitli, veri alanları açık (şifresiz koruma)
    await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatColumns: false,
        formatRows: false,
        insertRows: true,
        deleteRows: true,
        sort: false,
        autoFilter: false,
    });

    await wb.xlsx.writeFile(filePath);
    return { success: true, filePath };
});

// Excel'den toplu mükellef importı
const EXPECTED_HEADERS = ['firma adı', 'vergi numarası', 'gib kullanıcı kodu', 'gib şifresi'];
const normalizeExcelHeader = (value) =>
    String(value || '')
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ');

ipcMain.handle('import-clients-from-excel', async (event, fileBuffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(fileBuffer));
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
        return {
            saved: 0,
            errors: [],
            parseErrors: [{ row: 0, error: 'Excel dosyasında sayfa bulunamadı.' }],
        };
    }

    const clients = [];
    const parseErrors = [];

    // Header doğrulama
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values
        ? headerRow.values.slice(1).map((v) => normalizeExcelHeader(v))
        : [];
    const hasExpectedHeaders = EXPECTED_HEADERS.every((header, index) => headers[index] === header);

    if (!hasExpectedHeaders) {
        return {
            saved: 0,
            errors: [],
            parseErrors: [
                {
                    row: 1,
                    error: 'Excel başlıkları beklenen formatta değil. İlk satır: "Firma Adı, Vergi Numarası, GİB Kullanıcı Kodu, GİB Şifresi" olmalı. Şablonu indirip o formatta doldurun.',
                },
            ],
        };
    }

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const values = row.values.slice(1).map((v) => (v != null ? String(v).trim() : ''));
        const [firmName, taxNumber, gibUserCode, gibPassword] = values;

        if (!firmName || firmName.toLowerCase().startsWith('örnek')) {
            if (firmName && firmName.toLowerCase().startsWith('örnek')) return; // Örnek satırı sessizce atla
            parseErrors.push({ row: rowNumber, error: 'Firma adı boş' });
            return;
        }

        if (taxNumber && !/^\d{10,11}$/.test(taxNumber.replace(/\s/g, ''))) {
            parseErrors.push({
                row: rowNumber,
                error: `Geçersiz vergi no: "${taxNumber}" (10-11 haneli olmalı)`,
            });
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
            const safeFirmName = gibScraper.sanitizeFirmName(client.firm_name || String(clientId));
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

    const checkoutUrl = `${getCheckoutBaseUrl()}/checkout?${urlParams.toString()}`;

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
