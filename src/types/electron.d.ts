import type {
    Client,
    ClientFormData,
    Tebligat,
    ScanSettings,
    ScanState,
    ScanStatus,
    ScheduleConfig,
    ScheduleStatus,
    Credits,
    Subscription,
    UserInfo,
    LoginCredentials,
    LoginResult,
    StatementConvertRequest,
    ExportResult,
    UpdateStatus,
    ApiResponse,
} from './index';

export interface IElectronAPI {
    // License & Auth
    login: (credentials: LoginCredentials) => Promise<LoginResult>;
    logout: () => Promise<ApiResponse>;
    checkLicense: () => Promise<ApiResponse & { subscriptionStatus?: string }>;
    getSubscriptionStatus: () => Promise<Subscription>;
    getUserInfo: () => Promise<UserInfo>;
    openBillingPortal: (packageId?: string) => Promise<ApiResponse>;
    openForgotPassword: () => Promise<ApiResponse>;
    openCheckout: (params: {
        plan: string;
        period: string;
        email: string;
        name: string;
        phone?: string;
    }) => Promise<ApiResponse>;

    // Database Operations
    getClients: () => Promise<Client[]>;
    saveClient: (clientData: ClientFormData) => Promise<Client>;
    updateClient: (id: number, clientData: ClientFormData) => Promise<Client>;
    updateClientStatus: (id: number, status: Client['status']) => Promise<ApiResponse>;
    deleteClient: (id: number) => Promise<ApiResponse>;
    getTebligatlar: () => Promise<Tebligat[]>;
    deleteTebligat: (id: number) => Promise<ApiResponse>;
    deleteClientHistory: (clientId: number) => Promise<ApiResponse & { deletedCount?: number }>;

    // Automation
    startScan: () => void;
    resumeScan: () => void;
    cancelScan: () => void;
    getScanState: () => Promise<ScanState>;
    getRateLimits: () => Promise<{
        dailyUsed: number;
        dailyLimit: number;
        hourlyUsed: number;
        hourlyLimit: number;
    }>;
    vekaletDiscovery: (credentials: { userCode: string; password: string }) => Promise<{
        success: boolean;
        error?: string;
        token?: string;
        userInfo?: Record<string, unknown>;
        hasDegistirButton?: { found: boolean; text?: string; tag?: string };
        menuItems?: Array<{ text: string; tag: string; href: string | null }>;
        apiLogCount?: number;
        logPath?: string;
    }>;
    onScanUpdate: (callback: (status: ScanStatus) => void) => void;
    onScanError: (callback: (error: string) => void) => void;
    onScanComplete: (callback: (result: string) => void) => void;
    removeScanListeners: () => void;

    // Credits
    getCredits: () => Promise<Credits>;
    syncCredits: () => Promise<ApiResponse>;
    purchaseCredits: () => Promise<ApiResponse>;
    onCreditsUpdated: (callback: (credits: Credits) => void) => void;
    removeCreditsListeners: () => void;

    // Scan Settings
    getScanSettings: () => Promise<ScanSettings>;
    saveScanSettings: (settings: ScanSettings) => Promise<ApiResponse>;

    // Schedule
    getScheduleStatus: () => Promise<ScheduleStatus>;
    setSchedule: (config: ScheduleConfig) => Promise<ApiResponse>;

    // Statement Converter
    convertStatement: (data: StatementConvertRequest) => Promise<string>;

    // Export
    exportCsv: (data: string, defaultFileName?: string) => Promise<ExportResult>;
    exportExcel: (
        rows: Record<string, unknown>[],
        sheetName?: string,
        defaultFileName?: string
    ) => Promise<ExportResult>;

    // Document operations
    openDocument: (documentPath: string) => Promise<ApiResponse>;
    shareDocument: (documentPath: string) => Promise<ApiResponse>;
    openDocumentsFolder: () => Promise<ApiResponse & { path?: string }>;
    getDocumentsPath: () => Promise<string>;
    fetchTebligatDocument: (tebligatId: number) => Promise<ApiResponse & { path?: string }>;
    selectDocumentsFolder: () => Promise<ApiResponse & { path?: string }>;
    getDocumentsFolder: () => Promise<string>;

    // Legal consent
    getLegalConsent: () => Promise<boolean>;
    acceptLegalConsent: () => Promise<ApiResponse>;

    // Auto-update
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => void;
    removeUpdateListeners: () => void;
    startUpdateDownload: () => Promise<void>;
    restartAndUpdate: () => Promise<void>;
}

declare global {
    const __APP_VERSION__: string;
    interface Window {
        electronAPI: IElectronAPI;
    }
}
