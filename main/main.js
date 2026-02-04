const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config({
    path: path.join(__dirname, '../.env')
});
const supabase = require('./supabase');
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

// Start Scan
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

// Statement Converter
ipcMain.handle('convert-statement', async (event, { fileBuffer, mimeType, prompt }) => {
    if (!licenseManager.hasActiveSubscription()) {
        throw new Error('Aktif aboneliğiniz bulunmamaktadır. Lütfen abone olun.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Sistem yapılandırma hatası. Lütfen destek ile iletişime geçin.');
    }

    const result = await statementConverter.convert(Buffer.from(fileBuffer), mimeType, prompt, apiKey);
    return result;
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
