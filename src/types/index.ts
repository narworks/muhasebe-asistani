/**
 * Common type definitions for the application
 */

// Client (Mükellef) types
export interface Client {
    id: number;
    firm_name: string;
    tax_number?: string;
    gib_user_code?: string;
    gib_password?: string;
    status: 'active' | 'inactive';
}

export interface ClientFormData {
    firm_name: string;
    tax_number?: string;
    gib_user_code?: string;
    gib_password?: string;
    status?: 'active' | 'inactive' | 'pending';
}

// Tebligat types (matches SQLite query output)
export interface Tebligat {
    id: number;
    client_id: number;
    firm_name?: string;
    tebligat_date?: string;
    sender?: string;
    subject?: string;
    status?: string;
    document_no?: string;
    document_url?: string;
    document_path?: string;
    created_at?: string;
}

export interface TebligatGroup {
    client_id: number;
    firm_name: string;
    tebligatlar: Tebligat[];
}

// Scan types
export interface ScanSettings {
    batchSize?: number;
    delayBetweenClients?: number;
    startPeriod?: string;
    endPeriod?: string;
    lastScanAt?: string;
}

export interface ScanProgress {
    current: number;
    total: number;
    currentClient: string | null;
    errors: number;
    successes: number;
    insufficientCredits?: boolean;
    completed?: boolean;
}

export interface ScanState {
    canResume: boolean;
    processedCount: number;
    total: number;
    errors: number;
    successes: number;
    wasCancelled: boolean;
}

export interface ScanStatus {
    message: string;
    type: 'info' | 'error' | 'success' | 'process';
    progress?: ScanProgress;
}

// Discriminated union for scan updates from main process
export type ScanUpdate =
    | { type: 'progress'; progress: ScanProgress }
    | { type: 'scan-state'; scanState: ScanState }
    | ScanStatus;

// Schedule types
export interface ScheduleConfig {
    enabled: boolean;
    time?: string;
    finishByTime?: string;
    frequency?: 'daily' | 'weekdays' | 'weekends' | 'custom';
    customDays?: number[];
}

export interface ScheduleStatus extends ScheduleConfig {
    lastScheduledScanAt: string | null;
    nextScheduledScanAt: string | null;
    estimatedStartTime: string | null;
    estimatedDurationMinutes: number;
    clientCount: number;
}

// Credits types
export interface Credits {
    monthlyRemaining: number;
    monthlyLimit: number;
    monthlyUsed: number;
    purchasedRemaining: number;
    totalRemaining: number;
    resetAt: string | null;
    lastSyncAt: string | null;
}

// Subscription types
export interface Subscription {
    isActive: boolean;
    plan: string | null;
    expiresAt: string | null;
    status: string;
}

// User types
export interface UserInfo {
    userId: string | null;
    email: string | null;
}

// Auth types
export interface LoginCredentials {
    email: string;
    password: string;
}

export interface LoginResult {
    success: boolean;
    subscriptionStatus?: string;
    plan?: string;
    expiresAt?: string;
    message?: string;
}

// Statement Converter types
export interface StatementConvertRequest {
    fileBuffer: ArrayBuffer | number[]; // ArrayBuffer or serialized byte array for IPC
    mimeType: string;
    prompt?: string;
}

// Log entry type
export interface LogEntry {
    message: string;
    type: 'info' | 'error' | 'success' | 'process';
    timestamp: string;
}

// Update status types
export interface UpdateStatus {
    status:
        | 'update-checking'
        | 'update-available'
        | 'update-not-available'
        | 'update-error'
        | 'update-download-progress'
        | 'update-downloaded';
    version?: string;
    message?: string;
    percent?: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
}

// Export result type
export interface ExportResult {
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    error?: string;
}

// API Response types
export interface ApiResponse<T = void> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
