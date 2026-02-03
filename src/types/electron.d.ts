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
    onScanUpdate: (callback: (status: any) => void) => void;
    onScanError: (callback: (error: any) => void) => void;
    onScanComplete: (callback: (result: any) => void) => void;
    removeScanListeners: () => void;

    // Statement Converter
    convertStatement: (formData: any) => Promise<string>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
