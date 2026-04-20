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
    getClientLimit: () => ipcRenderer.invoke('get-client-limit'),
    importClientsFromExcel: (fileBuffer) =>
        ipcRenderer.invoke('import-clients-from-excel', fileBuffer),
    downloadExcelTemplate: () => ipcRenderer.invoke('download-excel-template'),
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
    getRateLimits: () => ipcRenderer.invoke('get-rate-limits'),
    previewScan: () => ipcRenderer.invoke('preview-scan'),
    downloadSelectedTebligatlar: (selections) =>
        ipcRenderer.invoke('download-selected-tebligatlar', selections),
    testClientLogin: (clientId) => ipcRenderer.invoke('test-client-login', clientId),
    getLastScanResults: () => ipcRenderer.invoke('get-last-scan-results'),
    getScanHistory: (limit) => ipcRenderer.invoke('get-scan-history', limit),
    getLastScanFailedIds: () => ipcRenderer.invoke('get-last-scan-failed-ids'),
    exportDiagBundle: (scanHistoryId) => ipcRenderer.invoke('export-diag-bundle', scanHistoryId),
    // Daemon control
    daemonGetState: () => ipcRenderer.invoke('daemon-get-state'),
    daemonStart: () => ipcRenderer.invoke('daemon-start'),
    daemonStop: () => ipcRenderer.invoke('daemon-stop'),
    daemonPause: (durationMs) => ipcRenderer.invoke('daemon-pause', durationMs),
    daemonResume: () => ipcRenderer.invoke('daemon-resume'),
    daemonGetSettings: () => ipcRenderer.invoke('daemon-get-settings'),
    daemonUpdateSettings: (settings) => ipcRenderer.invoke('daemon-update-settings', settings),
    onDaemonEvent: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('daemon-event', handler);
        return () => ipcRenderer.removeListener('daemon-event', handler);
    },
    scanSingleClient: (clientId) => ipcRenderer.invoke('scan-single-client', clientId),
    // Daemon popup helpers
    getRecentTebligatlar: (limit) => ipcRenderer.invoke('get-recent-tebligatlar', limit),
    openMainWindow: () => ipcRenderer.invoke('open-main-window'),
    getDiskUsage: (forceRefresh) => ipcRenderer.invoke('get-disk-usage', forceRefresh),
    getUnreadCount: () => ipcRenderer.invoke('get-unread-count'),
    onNavigateTo: (callback) => {
        const handler = (_event, path) => callback(path);
        ipcRenderer.on('navigate-to', handler);
        return () => ipcRenderer.removeListener('navigate-to', handler);
    },
    estimateScanDuration: (clientCount) =>
        ipcRenderer.invoke('estimate-scan-duration', clientCount),
    startScanWithOptions: (options) => ipcRenderer.send('start-scan-with-options', options),
    onScanUpdate: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('scan-update', handler);
        return () => ipcRenderer.removeListener('scan-update', handler);
    },
    onScanError: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('scan-error', handler);
        return () => ipcRenderer.removeListener('scan-error', handler);
    },
    onScanComplete: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('scan-complete', handler);
        return () => ipcRenderer.removeListener('scan-complete', handler);
    },

    // Legal consent
    getLegalConsent: () => ipcRenderer.invoke('get-legal-consent'),
    acceptLegalConsent: () => ipcRenderer.invoke('accept-legal-consent'),

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
    onCreditsUpdated: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('credits-updated', handler);
        return () => ipcRenderer.removeListener('credits-updated', handler);
    },

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
    onUpdateStatus: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('update-status', handler);
        return () => ipcRenderer.removeListener('update-status', handler);
    },
    startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
    restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),

    // Legacy cleanup — kept for backward compat but prefer per-listener cleanup
    removeScanListeners: () => {
        ipcRenderer.removeAllListeners('scan-update');
        ipcRenderer.removeAllListeners('scan-error');
        ipcRenderer.removeAllListeners('scan-complete');
    },
    removeCreditsListeners: () => {
        ipcRenderer.removeAllListeners('credits-updated');
    },
});
