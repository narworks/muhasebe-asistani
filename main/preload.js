const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Navigation / Shell
    // ...

    // License & Auth
    checkSubscription: (credentials) => ipcRenderer.invoke('check-subscription', credentials),
    checkLicense: () => ipcRenderer.invoke('check-license'),
    openBillingPortal: (packageId) => ipcRenderer.invoke('open-billing-portal', packageId),

    // Database Operations
    getClients: () => ipcRenderer.invoke('get-clients'),
    saveClient: (clientData) => ipcRenderer.invoke('save-client', clientData),
    updateClient: (id, clientData) => ipcRenderer.invoke('update-client', id, clientData),
    updateClientStatus: (id, status) => ipcRenderer.invoke('update-client-status', id, status),
    deleteClient: (id) => ipcRenderer.invoke('delete-client', id),
    getTebligatlar: () => ipcRenderer.invoke('get-tebligatlar'),

    // Statement Converter
    convertStatement: (data) => ipcRenderer.invoke('convert-statement', data),
    getCredits: (userId) => ipcRenderer.invoke('get-credits', userId),

    // API Key
    getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
    saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),

    // Automation
    startScan: () => ipcRenderer.send('start-scan'),
    onScanUpdate: (callback) => ipcRenderer.on('scan-update', (_event, value) => callback(value)),
    onScanError: (callback) => ipcRenderer.on('scan-error', (_event, value) => callback(value)),
    onScanComplete: (callback) => ipcRenderer.on('scan-complete', (_event, value) => callback(value)),

    // Cleanup listeners
    removeScanListeners: () => {
        ipcRenderer.removeAllListeners('scan-update');
        ipcRenderer.removeAllListeners('scan-error');
        ipcRenderer.removeAllListeners('scan-complete');
    }
});
