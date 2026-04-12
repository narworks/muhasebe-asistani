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
    getClientLimit: () => Promise<{ totalAdded: number; maxClients: number; remaining: number }>;
    importClientsFromExcel: (fileBuffer: ArrayBuffer) => Promise<{
        saved: number;
        errors: Array<{ row: number; firm_name: string; error: string }>;
        parseErrors: Array<{ row: number; error: string }>;
        limitError?: string;
    }>;
    downloadExcelTemplate: () => Promise<{ success: boolean; filePath?: string }>;
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
    previewScan: () => Promise<{
        ok: boolean;
        error?: string;
        results?: Array<{
            clientId: number;
            firmName: string;
            ok: boolean;
            error?: string;
            count?: number;
            tebligatList?: Array<{
                belgeNo: string;
                sender: string;
                subject: string;
                sendDate: string | null;
                notificationDate: string | null;
                status: string;
                _alreadyDownloaded?: boolean;
                _tebligId: number;
                _tebligSecureId: string;
                _tarafId: number;
                _tarafSecureId: string;
            }>;
        }>;
    }>;
    downloadSelectedTebligatlar: (
        selections: Array<{
            clientId: number;
            firmName: string;
            tebligatList: Array<{
                belgeNo: string;
                sender: string;
                subject: string;
                sendDate: string | null;
                notificationDate: string | null;
                status: string;
                _alreadyDownloaded?: boolean;
                _tebligId: number;
                _tebligSecureId: string;
                _tarafId: number;
                _tarafSecureId: string;
            }>;
        }>
    ) => Promise<{ ok: boolean; error?: string; downloaded?: number; errors?: number }>;
    testClientLogin: (clientId: number) => Promise<{
        success: boolean;
        errorType?:
            | 'wrong_credentials'
            | 'captcha_failed'
            | 'account_locked'
            | 'ip_blocked'
            | 'network_timeout'
            | 'no_password'
            | 'unknown';
        errorMessage?: string;
    }>;
    getLastScanResults: () => Promise<{
        ok: boolean;
        error?: string;
        results?: Array<{
            clientId: number;
            firmName: string;
            success: boolean;
            errorType?: string;
            errorMessage?: string;
        }>;
    }>;
    getScanHistory: (limit?: number) => Promise<
        Array<{
            id: number;
            startedAt: string;
            finishedAt: string | null;
            scanType: string | null;
            totalClients: number;
            successCount: number;
            errorCount: number;
            newTebligatCount: number;
            durationSeconds: number;
            results: Array<{
                clientId: number;
                firmName: string;
                success: boolean;
                errorType?: string;
                errorMessage?: string;
            }>;
        }>
    >;
    getLastScanFailedIds: () => Promise<number[]>;
    estimateScanDuration: (clientCount?: number) => Promise<{
        count: number;
        estimatedMinutes: number;
        error?: string;
    }>;
    startScanWithOptions: (options: {
        clientIds?: number[];
        prioritizeFailed?: boolean;
        scanType?: string;
    }) => void;
    onScanUpdate: (callback: (status: ScanStatus) => void) => () => void;
    onScanError: (callback: (error: string) => void) => () => void;
    onScanComplete: (callback: (result: string) => void) => () => void;
    removeScanListeners: () => void;

    // Credits
    getCredits: () => Promise<Credits>;
    syncCredits: () => Promise<ApiResponse>;
    purchaseCredits: () => Promise<ApiResponse>;
    onCreditsUpdated: (callback: (credits: Credits) => void) => () => void;
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
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    startUpdateDownload: () => Promise<void>;
    restartAndUpdate: () => Promise<void>;
}

declare global {
    const __APP_VERSION__: string;
    interface Window {
        electronAPI: IElectronAPI;
    }
}
