const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const logger = require('./logger');

let mainWindow = null;
let userInitiatedDownload = false;
let updateReady = false; // true when update is downloaded and waiting for restart
let onUpdateReadyCallback = null;

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

        // Show native notification so user notices even if main window is closed (tray-only mode)
        try {
            const notifications = require('./notifications');
            notifications.show({
                title: '✨ Güncelleme Hazır',
                body: `Muhasebe Asistanı v${info.version} indirildi. Yüklemek için tıklayın (uygulama yeniden başlatılacak).`,
                urgency: 'normal',
                onClick: () => {
                    quitAndInstall();
                },
            });
        } catch (err) {
            logger.debug(`[AutoUpdater] notification error: ${err.message}`);
        }

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

function quitAndInstall() {
    // On macOS, Squirrel's ShipIt needs the app to be fully exited
    // before it can replace the bundle. app.quit() is too slow —
    // ShipIt sees the app still running and aborts.
    // Use autoUpdater.quitAndInstall with isSilent=true to force quit,
    // then app.exit as fallback.
    autoUpdater.quitAndInstall(true, true);
    setTimeout(() => app.exit(0), 1000);
}

module.exports = {
    init,
    checkForUpdates,
    startDownload,
    quitAndInstall,
    isUpdateReady,
    setOnUpdateReady,
};
