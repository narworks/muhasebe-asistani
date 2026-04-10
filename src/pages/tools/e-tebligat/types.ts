import type { Tebligat } from '../../../types';

export interface ScanGroup {
    scanDate: string;
    scanLabel: string;
    tebligatlar: Tebligat[];
}

export interface ClientGroup {
    client_id: number;
    firm_name: string;
    tebligatlar: Tebligat[];
    scanGroups: ScanGroup[];
}

export type ClientTestStatus = 'idle' | 'running' | 'ok' | 'fail';

export type ScanResultItem = {
    clientId: number;
    firmName: string;
    success: boolean;
    errorType?: string;
    errorMessage?: string;
};

export type ScanHistoryItem = {
    id: number;
    startedAt: string;
    finishedAt: string | null;
    scanType: string | null;
    totalClients: number;
    successCount: number;
    errorCount: number;
    newTebligatCount: number;
    durationSeconds: number;
    results: ScanResultItem[];
};

export type PreviewTebligat = {
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
};

export type PreviewClientResult = {
    clientId: number;
    firmName: string;
    ok: boolean;
    error?: string;
    count?: number;
    tebligatList?: PreviewTebligat[];
};

export type PreviewSelectionMode = 'skip' | 'last15' | 'last30' | 'last6m' | 'thisYear' | 'all';

export type LogEntry = {
    message: string;
    type: 'info' | 'error' | 'success' | 'process';
    timestamp: string;
};
