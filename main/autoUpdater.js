const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const logger = require('./logger');

let mainWindow = null;
let userInitiatedDownload = false;
let updateReady = false; // true when update is downloaded and waiting for restart
let onUpdateReadyCallback = null;
let installInProgress = false; // re-entrancy guard for quitAndInstall
let reminderTimeouts = []; // v1.9.14: keep reference to cancel on quit

function setOnUpdateReady(callback) {
    onUpdateReadyCallback = callback;
}

function isUpdateReady() {
    return updateReady;
}

/**
 * Initialize auto-updater
 * @param {BrowserWindow} win - Main window reference
 */
function init(win) {
    mainWindow = win;

    // Don't check for updates in development
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        logger.debug('[AutoUpdater] Skipping in development mode');
        return;
    }

    // Configure auto-updater
    // autoDownload: true — silently download updates in background. Critical for
    // users who keep the app running continuously in tray (daemon mode).
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        logger.debug('[AutoUpdater] Checking for updates...');
        sendStatusToWindow('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        logger.debug('[AutoUpdater] Update available:', info.version);
        sendStatusToWindow('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
        logger.debug('[AutoUpdater] No updates available');
        sendStatusToWindow('update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Error:', err.message, err.stack);
        logger.info(
            '[AutoUpdater] Platform:',
            process.platform,
            'Arch:',
            process.arch,
            'Version:',
            app.getVersion()
        );

        // Filter transient network errors — don't show in UI, they're recoverable.
        // Only surface errors that occurred during user-initiated download.
        const msg = err.message || '';
        const isTransient =
            msg.includes('HttpError') ||
            msg.includes('ECONNRESET') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('ENOTFOUND') ||
            msg.includes('ECONNREFUSED') ||
            msg.includes('EAI_AGAIN') ||
            // v1.9.14: SSL/network downgrade errors (antivirus MITM, expired CA, DNS filters)
            msg.includes('ERR_SSL_PROTOCOL_ERROR') ||
            msg.includes('ERR_CERT_') ||
            msg.includes('ERR_NETWORK_CHANGED') ||
            msg.includes('ERR_INTERNET_DISCONNECTED') ||
            /: 5\d{2}/.test(msg) || // 5xx HTTP errors
            /: 429/.test(msg); // Rate limit

        if (isTransient && !userInitiatedDownload) {
            logger.debug('[AutoUpdater] Transient error, not shown to user');
            return;
        }

        sendStatusToWindow('update-error', { message: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        logger.debug(`[AutoUpdater] Download progress: ${percent}%`);
        sendStatusToWindow('update-download-progress', {
            percent,
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        logger.debug('[AutoUpdater] Update downloaded:', info.version);
        updateReady = true;
        sendStatusToWindow('update-downloaded', info);

        // v1.9.14: Tray-mode kullanıcıları için main window'u nazikçe restore et.
        // Overlay (UpdateBanner) window görünmezse çalışmıyor; kullanıcı fark etmiyor.
        // Minimize durumundaysa restore + gizliyse show; focus KOYMUYORUZ ki mevcut işi bölmesin.
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                if (!mainWindow.isVisible()) mainWindow.show();
            }
        } catch (err) {
            logger.info(`[AutoUpdater] window restore error: ${err.message}`);
        }

        // İlk bildirimi hemen göster.
        showUpdateReadyNotification(info);

        // v1.9.14: Kullanıcı ilk bildirimi kaçırırsa diye tekrarlayan hatırlatıcı.
        // 30 dk → 2 sa → 6 sa → sonra günde 1 kez. updateReady false olursa (install başladıysa)
        // otomatik durur.
        scheduleUpdateReminders(info);

        // Notify main.js so it can update tray menu
        if (onUpdateReadyCallback) {
            try {
                onUpdateReadyCallback(info);
            } catch (err) {
                logger.debug(`[AutoUpdater] callback error: ${err.message}`);
            }
        }
    });

    // Check for updates after app is ready (delay 5 seconds)
    setTimeout(() => {
        checkForUpdates();
    }, 5000);

    // On Windows, check again after 30 seconds (first check sometimes fails)
    if (process.platform === 'win32') {
        setTimeout(() => {
            checkForUpdates();
        }, 30000);
    }

    // Re-check every 1 hour while app is running
    setInterval(
        () => {
            checkForUpdates();
        },
        1 * 60 * 60 * 1000
    );
}

/**
 * v1.9.14: Native "Güncelleme Hazır" bildirimini gösterir.
 * Hem ilk gösterim hem tekrarlayan hatırlatıcılar aynı fonksiyonu kullanır.
 * bypassSettings: kullanıcı scan notification'larını kapatmış olsa bile update bildirimi gitmeli.
 */
function showUpdateReadyNotification(info) {
    try {
        const notifications = require('./notifications');
        notifications.show({
            title: '✨ Güncelleme Hazır',
            body: `Muhasebe Asistanı v${info.version} indirildi. Yüklemek için tıklayın (uygulama yeniden başlatılacak).`,
            urgency: 'normal',
            bypassSettings: true,
            skipOpenWindow: true,
            onClick: () => {
                logger.info('[AutoUpdater] Update notification clicked by user');
                quitAndInstall();
            },
        });
    } catch (err) {
        logger.info(`[AutoUpdater] notification error: ${err.message}`);
    }
}

/**
 * v1.9.14: Update indirildikten sonra tekrarlayan hatırlatıcılar planlar.
 * Kullanıcı ilk bildirimi kaçırırsa (tray'de app açık, notification geçici görüldü),
 * 30 dk / 2 sa / 6 sa sonra tekrar, sonra günde 1 kez hatırlatır.
 * updateReady false olursa (kullanıcı install'a başladı) otomatik durur.
 */
function scheduleUpdateReminders(info) {
    // Önceki reminder'ları temizle (edge case: aynı session'da 2 update)
    reminderTimeouts.forEach((t) => clearTimeout(t));
    reminderTimeouts = [];

    const schedule = [
        30 * 60_000, // 30 dk
        2 * 60 * 60_000, // 2 saat
        6 * 60 * 60_000, // 6 saat
    ];

    schedule.forEach((delay) => {
        const t = setTimeout(() => {
            if (updateReady && !installInProgress) {
                logger.info(`[AutoUpdater] Reminding user about pending update (delay=${delay}ms)`);
                showUpdateReadyNotification(info);
            }
        }, delay);
        reminderTimeouts.push(t);
    });

    // Uzun vadeli: günde 1 kez hatırlat (setInterval, updateReady false olursa clear)
    const dailyReminder = setInterval(
        () => {
            if (updateReady && !installInProgress) {
                logger.info('[AutoUpdater] Daily reminder for pending update');
                showUpdateReadyNotification(info);
            } else {
                clearInterval(dailyReminder);
            }
        },
        24 * 60 * 60_000
    );
    reminderTimeouts.push(dailyReminder);
}

/**
 * Manually check for updates
 */
function checkForUpdates() {
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        logger.debug('[AutoUpdater] Skipping update check in development');
        return;
    }

    logger.debug('[AutoUpdater] Checking for updates...');
    autoUpdater.checkForUpdates().catch((err) => {
        console.error('[AutoUpdater] Check failed:', err.message);
    });
}

/**
 * Send update status to renderer
 */
function sendStatusToWindow(status, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status, ...data });
    }
}

function startDownload() {
    userInitiatedDownload = true;
    autoUpdater.downloadUpdate();
}

// Callback that main.js registers to flip its isQuitting flag before we quit.
// Without this, mainWindow.on('close') handler calls event.preventDefault()
// because isQuitting=false, and app.quit() stalls waiting for window to close.
let onBeforeQuitCallback = null;

function setOnBeforeQuit(cb) {
    onBeforeQuitCallback = cb;
}

function quitAndInstall() {
    if (installInProgress) {
        logger.info('[AutoUpdater] quitAndInstall already in progress, ignoring duplicate call');
        return;
    }
    installInProgress = true;
    logger.info('[AutoUpdater] quitAndInstall called — restarting to apply update');

    // 1) Notify main.js to set isQuitting=true so window close handler doesn't
    //    preventDefault() and stall app.quit().
    try {
        if (onBeforeQuitCallback) {
            onBeforeQuitCallback();
            logger.info('[AutoUpdater] onBeforeQuit callback invoked (isQuitting set)');
        }
    } catch (err) {
        logger.info(`[AutoUpdater] onBeforeQuit callback error: ${err.message}`);
    }

    // 2) Belt + suspenders: explicitly remove close listeners from all windows
    //    so even if isQuitting wasn't propagated, close goes through.
    try {
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((win) => {
            try {
                win.removeAllListeners('close');
            } catch {
                /* ignore */
            }
        });
        logger.info('[AutoUpdater] Removed close listeners from all windows');
    } catch (err) {
        logger.info(`[AutoUpdater] Remove listeners error: ${err.message}`);
    }

    // 3) Trigger the actual install + relaunch.
    try {
        autoUpdater.quitAndInstall(true, true);
        logger.info('[AutoUpdater] quitAndInstall(true, true) returned');
    } catch (err) {
        logger.info(`[AutoUpdater] quitAndInstall threw: ${err.message}`);
    }

    // Fallback: if Squirrel/ShipIt didn't quit the app, force-exit after 5s.
    // Previous 1s was killing the process before Squirrel could finish the
    // bundle replacement → update would never actually install → endless loop.
    // 5s gives Squirrel handshake + before-quit async cleanup (CRNN worker
    // termination, telemetry flush) enough time to complete.
    setTimeout(() => {
        logger.info('[AutoUpdater] Fallback app.exit(0) triggered after 5s');
        app.exit(0);
    }, 5000);

    // If after 8s we're still running, the quit failed — surface a dialog.
    setTimeout(() => {
        logger.info('[AutoUpdater] Still running after 8s — showing manual-restart dialog');
        try {
            const { dialog } = require('electron');
            dialog.showMessageBox({
                type: 'warning',
                title: 'Güncelleme başlatılamadı',
                message: 'Uygulama otomatik olarak yeniden başlatılamadı.',
                detail: "Muhasebe Asistanı'nı elle kapatıp yeniden açarak güncellemeyi tamamlayabilirsiniz. Güncelleme dosyası indirildi ve hazır.",
                buttons: ['Tamam'],
            });
        } catch (err) {
            logger.info(`[AutoUpdater] Fallback dialog error: ${err.message}`);
        }
        installInProgress = false; // allow retry
    }, 8000);
}

module.exports = {
    init,
    checkForUpdates,
    startDownload,
    quitAndInstall,
    isUpdateReady,
    setOnUpdateReady,
    setOnBeforeQuit,
};
