const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // License & Auth
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    logout: () => ipcRenderer.invoke('logout'),
    checkLicense: () => ipcRenderer.invoke('check-license'),
    getSubscriptionStatus: () => ipcRenderer.invoke('get-subscription-status'),
    getUserInfo: () => ipcRenderer.invoke('get-user-info'),
    openBillingPortal: (packageId) => ipcRenderer.invoke('open-billing-portal', packageId),
    openForgotPassword: () => ipcRenderer.invoke('open-forgot-password'),
    openCheckout: (params) => ipcRenderer.invoke('open-checkout', params),

    // Database Operations
    getClients: () => ipcRenderer.invoke('get-clients'),
    saveClient: (clientData) => ipcRenderer.invoke('save-client', clientData),
    updateClient: (id, clientData) => ipcRenderer.invoke('update-client', id, clientData),
    updateClientStatus: (id, status) => ipcRenderer.invoke('update-client-status', id, status),
    deleteClient: (id) => ipcRenderer.invoke('delete-client', id),
    getTebligatlar: () => ipcRenderer.invoke('get-tebligatlar'),
    deleteTebligat: (id) => ipcRenderer.invoke('delete-tebligat', id),
    deleteClientHistory: (clientId) => ipcRenderer.invoke('delete-client-history', clientId),

    // Statement Converter
    convertStatement: (data) => ipcRenderer.invoke('convert-statement', data),

    // Automation
    startScan: () => ipcRenderer.send('start-scan'),
    resumeScan: () => ipcRenderer.send('resume-scan'),
    cancelScan: () => ipcRenderer.send('cancel-scan'),
    getScanState: () => ipcRenderer.invoke('get-scan-state'),
    onScanUpdate: (callback) => ipcRenderer.on('scan-update', (_event, value) => callback(value)),
    onScanError: (callback) => ipcRenderer.on('scan-error', (_event, value) => callback(value)),
    onScanComplete: (callback) =>
        ipcRenderer.on('scan-complete', (_event, value) => callback(value)),

    // Scan Settings
    getScanSettings: () => ipcRenderer.invoke('get-scan-settings'),
    saveScanSettings: (settings) => ipcRenderer.invoke('save-scan-settings', settings),

    // Schedule
    getScheduleStatus: () => ipcRenderer.invoke('get-schedule-status'),
    setSchedule: (config) => ipcRenderer.invoke('set-schedule', config),

    // Credits
    getCredits: () => ipcRenderer.invoke('get-credits'),
    syncCredits: () => ipcRenderer.invoke('sync-credits'),
    purchaseCredits: () => ipcRenderer.invoke('purchase-credits'),
    onCreditsUpdated: (callback) =>
        ipcRenderer.on('credits-updated', (_event, value) => callback(value)),

    // Export
    exportCsv: (data, defaultFileName) =>
        ipcRenderer.invoke('export-csv', { data, defaultFileName }),
    exportExcel: (rows, sheetName, defaultFileName) =>
        ipcRenderer.invoke('export-excel', { rows, sheetName, defaultFileName }),

    // Document operations
    openDocument: (documentPath) => ipcRenderer.invoke('open-document', documentPath),
    shareDocument: (documentPath) => ipcRenderer.invoke('share-document', documentPath),
    openDocumentsFolder: () => ipcRenderer.invoke('open-documents-folder'),
    getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),
    fetchTebligatDocument: (tebligatId) =>
        ipcRenderer.invoke('fetch-tebligat-document', tebligatId),
    selectDocumentsFolder: () => ipcRenderer.invoke('select-documents-folder'),
    getDocumentsFolder: () => ipcRenderer.invoke('get-documents-folder'),

    // Auto-update
    onUpdateStatus: (callback) =>
        ipcRenderer.on('update-status', (_event, value) => callback(value)),
    removeUpdateListeners: () => {
        ipcRenderer.removeAllListeners('update-status');
    },
    startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
    restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),

    // Cleanup listeners
    removeScanListeners: () => {
        ipcRenderer.removeAllListeners('scan-update');
        ipcRenderer.removeAllListeners('scan-error');
        ipcRenderer.removeAllListeners('scan-complete');
    },
    removeCreditsListeners: () => {
        ipcRenderer.removeAllListeners('credits-updated');
    },
});
