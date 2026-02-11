const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config({
    path: path.join(__dirname, '../.env')
});
const supabase = require('./supabase');
const licenseManager = require('./license');
const database = require('./database');
const gibScraper = require('./automation/gibScraper');
const statementConverter = require('./automation/statementConverter');
const settings = require('./settings');
const scheduler = require('./scheduler');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;
let tray = null;
let isQuitting = false;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
};

// Helper: run scan with status updates
const runScanWithUpdates = async () => {
    if (!licenseManager.hasActiveSubscription()) {
        console.log('[Scheduler] Skipping scan - no active subscription');
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('[Scheduler] Skipping scan - no API key');
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
        await gibScraper.run((status) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scan-update', status);
            }
        }, apiKey, scanConfig, {}, deductCredit);

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

    // System tray
    const trayIcon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABjSURBVDiNY/j//z8DCjAxMDAwMDIy/mdgYGBgAmH8gImBgYGBiRCfkYGBgQlfIBMxBjAxMjL+JxTNROvCxMjI+B9fNBMDmBgYGBhIjUamhw8fUu4FYgNqJSNKk9F/Ag4BAOqQFBETnp7LAAAAAElFTkSuQmCC'
    );
    tray = new Tray(trayIcon);
    const trayMenu = Menu.buildFromTemplate([
        { label: 'Aç', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { type: 'separator' },
        { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('Muhasebe Asistanı');
    tray.setContextMenu(trayMenu);
    tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });

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
});

app.on('window-all-closed', () => {
    // Don't quit - stay in tray for scheduled scans
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
    if (!licenseManager.hasActiveSubscription()) {
        event.reply('scan-error', 'Üyelik aktif değil! Lütfen giriş yapınız.');
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

    try {
        await gibScraper.run((status) => {
            if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scan-update', status);
            }
        }, apiKey, scanConfig, {}, deductCredit);

        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        console.error("Scan error:", error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
    }
});

// Resume Scan (continue from where stopped)
ipcMain.on('resume-scan', async (event) => {
    if (!licenseManager.hasActiveSubscription()) {
        event.reply('scan-error', 'Üyelik aktif değil! Lütfen giriş yapınız.');
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

    try {
        await gibScraper.run((status) => {
            if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scan-update', status);
            }
        }, apiKey, scanConfig, { resume: true }, deductCredit);

        settings.updateSettings({ scan: { lastScanAt: new Date().toISOString() } });
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        console.error("Resume scan error:", error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
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

// Scan Settings
ipcMain.handle('get-scan-settings', () => {
    return settings.readSettings().scan || {};
});

ipcMain.handle('save-scan-settings', (event, scanSettings) => {
    settings.updateSettings({ scan: scanSettings });
    return { success: true };
});

// Schedule Management
ipcMain.handle('get-schedule-status', () => {
    return scheduler.getStatus();
});

ipcMain.handle('set-schedule', (event, { enabled, time, finishByTime, frequency = 'daily', customDays = [] }) => {
    // Use finishByTime if provided, otherwise fallback to time for backwards compatibility
    const targetTime = finishByTime || time;
    if (enabled && targetTime) {
        const success = scheduler.startSchedule(targetTime, frequency, customDays);
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
    const url = `${billingUrl}?package=credit-1000`;

    const billingWindow = new BrowserWindow({
        width: 900,
        height: 800,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
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
ipcMain.handle('get-clients', (event) => {
    return database.getClients();
});

ipcMain.handle('save-client', (event, clientData) => {
    const result = database.saveClient(clientData);
    // Refresh schedule when client count changes
    scheduler.refreshSchedule();
    return result;
});

ipcMain.handle('update-client', (event, id, clientData) => {
    return database.updateClient(id, clientData);
});

ipcMain.handle('update-client-status', (event, id, status) => {
    const result = database.updateClientStatus(id, status);
    // Refresh schedule when client status changes (affects active count)
    scheduler.refreshSchedule();
    return result;
});

ipcMain.handle('delete-client', (event, id) => {
    const result = database.deleteClient(id);
    // Refresh schedule when client count changes
    scheduler.refreshSchedule();
    return result;
});

ipcMain.handle('get-tebligatlar', () => {
    return database.getTebligatlar();
});

// Statement Converter
ipcMain.handle('convert-statement', async (event, { fileBuffer, mimeType, prompt }) => {
    if (!licenseManager.hasActiveSubscription()) {
        throw new Error('Aktif aboneliğiniz bulunmamaktadır. Lütfen abone olun.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Sistem yapılandırma hatası. Lütfen destek ile iletişime geçin.');
    }

    // Kredi kontrolü ve düşme (5 kredi)
    const creditResult = await licenseManager.deductCredits(5, 'statement_convert');
    if (!creditResult.success) {
        if (creditResult.error === 'insufficient_credits') {
            throw new Error(`Yetersiz kredi. Bu işlem 5 kredi gerektirir. Kalan krediniz: ${creditResult.totalRemaining || 0}`);
        }
        throw new Error('Kredi kontrolü başarısız.');
    }

    try {
        const result = await statementConverter.convert(Buffer.from(fileBuffer), mimeType, prompt, apiKey);

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

// Billing Portal
ipcMain.handle('open-billing-portal', async (event, packageId) => {
    const billingUrl = licenseManager.getBillingUrl();
    const url = packageId ? `${billingUrl}?package=${encodeURIComponent(packageId)}` : billingUrl;

    const billingWindow = new BrowserWindow({
        width: 900,
        height: 800,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    billingWindow.loadURL(url);
    billingWindow.on('closed', async () => {
        await licenseManager.checkLicense();
    });

    return { success: true };
});

// Export to CSV
ipcMain.handle('export-csv', async (event, { data, defaultFileName }) => {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'CSV olarak kaydet',
        defaultPath: defaultFileName || 'export.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
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
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    try {
        const ws = XLSX.utils.json_to_sheet(rows);

        // Auto-width columns
        if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            ws['!cols'] = headers.map((header, colIndex) => {
                let maxWidth = header.length;
                rows.forEach(row => {
                    const value = String(Object.values(row)[colIndex] || '');
                    maxWidth = Math.max(maxWidth, value.length);
                });
                return { wch: Math.min(maxWidth + 2, 50) };
            });
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
        XLSX.writeFile(wb, filePath);

        return { success: true, filePath };
    } catch (error) {
        console.error('Excel export error:', error);
        return { success: false, error: error.message };
    }
});

// Open document (PDF, etc.)
ipcMain.handle('open-document', async (event, documentPath) => {
    if (!documentPath) {
        return { success: false, error: 'Döküman yolu belirtilmedi.' };
    }

    if (!fs.existsSync(documentPath)) {
        return { success: false, error: 'Döküman bulunamadı.' };
    }

    try {
        await shell.openPath(documentPath);
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
    const userDataPath = app.getPath('userData');
    const documentsPath = path.join(userDataPath, 'documents');

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
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'documents');
});
