const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();
const licenseManager = require('./license');
const database = require('./database');
const gibScraper = require('./automation/gibScraper');
const statementConverter = require('./automation/statementConverter');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let mainWindow;

const createWindow = () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Security best practice
            contextIsolation: true, // Security best practice
            sandbox: false // Required for some complex node usages if needed, but try true if possible. Using false for safeStorage/sqlite interactions usually fine in main, but preload has limited access.
            // logic is in main, so safely exposed via preload.
        },
    });

    // Load the app
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
};

app.whenReady().then(() => {
    // Initialize DB
    database.init();
    licenseManager.init();
    licenseManager.checkLicense();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


// --- IPC HANDLERS ---

// Example: License Check
ipcMain.handle('check-subscription', async (event, credentials) => {
    return await licenseManager.login(credentials);
});

ipcMain.handle('check-license', async () => {
    return await licenseManager.checkLicense();
});

// Example: Start Scan
ipcMain.on('start-scan', async (event) => {
    // 1. Check License Status from memory
    if (!licenseManager.hasActiveSubscription()) {
        event.reply('scan-error', 'Üyelik aktif değil! Lütfen giriş yapınız.');
        return;
    }

    const apiKey = licenseManager.getApiKey();
    if (!apiKey) {
        event.reply('scan-error', 'API anahtarı bulunamadı. Lütfen API anahtarınızı girin.');
        return;
    }

    // 2. Run Scraper
    // Note: In a real app we might want to get specific clients from DB here or pass them in.
    // For now assuming we pull from DB inside scraper or pass generic signal.

    try {
        await gibScraper.run((status) => {
            if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scan-update', status);
            }
        }, apiKey);
        event.reply('scan-complete', 'Taramalar tamamlandı.');
    } catch (error) {
        console.error("Scan error:", error);
        event.reply('scan-error', 'Tarama sırasında hata oluştu: ' + error.message);
    }
});

// Database IPCs
ipcMain.handle('get-clients', (event) => {
    return database.getClients();
});

ipcMain.handle('save-client', (event, clientData) => {
    return database.saveClient(clientData);
});

ipcMain.handle('update-client', (event, id, clientData) => {
    return database.updateClient(id, clientData);
});

ipcMain.handle('update-client-status', (event, id, status) => {
    return database.updateClientStatus(id, status);
});

ipcMain.handle('delete-client', (event, id) => {
    return database.deleteClient(id);
});

ipcMain.handle('get-tebligatlar', () => {
    return database.getTebligatlar();
});

ipcMain.handle('convert-statement', async (event, { fileBuffer, mimeType, prompt }) => {
    if (!licenseManager.hasActiveSubscription()) {
        throw new Error('Üyelik aktif değil. Lütfen internete bağlanıp lisansı doğrulayın.');
    }

    if (licenseManager.getCredits() < 1) {
        throw new Error('Yetersiz kredi. Lütfen kredi satın alın.');
    }

    const apiKey = licenseManager.getApiKey();
    if (!apiKey) {
        throw new Error('API anahtarı bulunamadı. Lütfen API anahtarınızı girin.');
    }

    const result = await statementConverter.convert(Buffer.from(fileBuffer), mimeType, prompt, apiKey);
    licenseManager.consumeCredits(1);
    return result;
});

ipcMain.handle('get-credits', async (event, userId) => {
    return { balance: licenseManager.getCredits() };
});

ipcMain.handle('get-api-key-status', () => {
    return { hasKey: licenseManager.hasApiKey() };
});

ipcMain.handle('save-api-key', (event, apiKey) => {
    try {
        licenseManager.setApiKey(apiKey);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

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
