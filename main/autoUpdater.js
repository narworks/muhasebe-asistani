const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');

let mainWindow = null;

/**
 * Initialize auto-updater
 * @param {BrowserWindow} win - Main window reference
 */
function init(win) {
    mainWindow = win;

    // Don't check for updates in development
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        console.log('[AutoUpdater] Skipping in development mode');
        return;
    }

    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
        sendStatusToWindow('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
        sendStatusToWindow('update-available', info);

        // Show dialog to user
        dialog
            .showMessageBox(mainWindow, {
                type: 'info',
                title: 'Güncelleme Mevcut',
                message: `Yeni bir sürüm mevcut: v${info.version}`,
                detail: 'Güncellemek ister misiniz? Uygulama kapanacak ve güncelleme yüklenecek.',
                buttons: ['Güncelle', 'Daha Sonra'],
                defaultId: 0,
                cancelId: 1,
            })
            .then(({ response }) => {
                if (response === 0) {
                    autoUpdater.downloadUpdate();
                }
            });
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[AutoUpdater] No updates available');
        sendStatusToWindow('update-not-available', info);
    });

    autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Error:', err.message);
        sendStatusToWindow('update-error', { message: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        console.log(`[AutoUpdater] Download progress: ${percent}%`);
        sendStatusToWindow('update-download-progress', {
            percent,
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
        sendStatusToWindow('update-downloaded', info);

        // Show dialog and quit/install
        dialog
            .showMessageBox(mainWindow, {
                type: 'info',
                title: 'Güncelleme Hazır',
                message: 'Güncelleme indirildi.',
                detail: 'Uygulamayı yeniden başlatmak için "Şimdi Yeniden Başlat" butonuna tıklayın.',
                buttons: ['Şimdi Yeniden Başlat', 'Daha Sonra'],
                defaultId: 0,
                cancelId: 1,
            })
            .then(({ response }) => {
                if (response === 0) {
                    autoUpdater.quitAndInstall(false, true);
                }
            });
    });

    // Check for updates after app is ready (delay 5 seconds)
    setTimeout(() => {
        checkForUpdates();
    }, 5000);
}

/**
 * Manually check for updates
 */
function checkForUpdates() {
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        console.log('[AutoUpdater] Skipping update check in development');
        return;
    }

    console.log('[AutoUpdater] Checking for updates...');
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

module.exports = {
    init,
    checkForUpdates,
};
