const { autoUpdater } = require('electron-updater');
const { app } = require('electron');
const logger = require('./logger');

let mainWindow = null;

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
    autoUpdater.autoDownload = false;
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
        console.error('[AutoUpdater] Error:', err.message);
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
        sendStatusToWindow('update-downloaded', info);
    });

    // Check for updates after app is ready (delay 5 seconds)
    setTimeout(() => {
        checkForUpdates();
    }, 5000);

    // Re-check every 2 hours while app is running
    setInterval(
        () => {
            checkForUpdates();
        },
        2 * 60 * 60 * 1000
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
};
