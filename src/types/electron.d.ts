export interface IElectronAPI {
    // License & Auth
    checkSubscription: (credentials: { email: string; password: string }) => Promise<{ success: boolean; subscriptionStatus?: string; plan?: string; credits?: number; billingUrl?: string; message?: string }>;
    checkLicense: () => Promise<{ success: boolean; subscriptionStatus?: string; credits?: number; message?: string }>;
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

    // Statement Converter (Ported)
    convertStatement: (formData: any) => Promise<string>; // Returns CSV string or error

    // Misc
    getCredits: (userId: string) => Promise<{ balance: number }>;
    getApiKeyStatus: () => Promise<{ hasKey: boolean }>;
    saveApiKey: (apiKey: string) => Promise<{ success: boolean; message?: string }>;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
