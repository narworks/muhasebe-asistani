export interface IElectronAPI {
    // License & Auth
    login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; subscriptionStatus?: string; plan?: string; expiresAt?: string; message?: string }>;
    logout: () => Promise<{ success: boolean }>;
    checkLicense: () => Promise<{ success: boolean; subscriptionStatus?: string; message?: string }>;
    getSubscriptionStatus: () => Promise<{ isActive: boolean; plan: string | null; expiresAt: string | null; status: string }>;
    getUserInfo: () => Promise<{ userId: string | null; email: string | null }>;
    openBillingPortal: (packageId?: string) => Promise<{ success: boolean }>;

    // Database Operations
    getClients: () => Promise<any[]>;
    saveClient: (clientData: any) => Promise<any>;
    updateClient: (id: number, clientData: any) => Promise<any>;
    updateClientStatus: (id: number, status: string) => Promise<any>;
    deleteClient: (id: number) => Promise<any>;
    getTebligatlar: () => Promise<any[]>;

    // Automation
    startScan: () => void;
    resumeScan: () => void;
    cancelScan: () => void;
    getScanState: () => Promise<{
        canResume: boolean;
        processedCount: number;
        total: number;
        errors: number;
        successes: number;
        wasCancelled: boolean;
    }>;
    onScanUpdate: (callback: (status: any) => void) => void;
    onScanError: (callback: (error: any) => void) => void;
    onScanComplete: (callback: (result: any) => void) => void;
    removeScanListeners: () => void;

    // Credits
    getCredits: () => Promise<{
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
        lastSyncAt: string | null;
    }>;
    syncCredits: () => Promise<{ success: boolean; message?: string }>;
    purchaseCredits: () => Promise<{ success: boolean }>;
    onCreditsUpdated: (callback: (credits: {
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
        lastSyncAt: string | null;
    }) => void) => void;
    removeCreditsListeners: () => void;

    // Scan Settings
    getScanSettings: () => Promise<any>;
    saveScanSettings: (settings: any) => Promise<{ success: boolean }>;

    // Schedule
    getScheduleStatus: () => Promise<{
        enabled: boolean;
        time: string;
        frequency: 'daily' | 'weekdays' | 'weekends' | 'custom';
        customDays: number[];
        lastScheduledScanAt: string | null;
        nextScheduledScanAt: string | null;
    }>;
    setSchedule: (config: {
        enabled: boolean;
        time: string;
        frequency?: 'daily' | 'weekdays' | 'weekends' | 'custom';
        customDays?: number[];
    }) => Promise<{ success: boolean }>;

    // Statement Converter
    convertStatement: (formData: any) => Promise<string>;

    // Export
    exportCsv: (data: string, defaultFileName?: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
    exportExcel: (rows: any[], sheetName?: string, defaultFileName?: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
