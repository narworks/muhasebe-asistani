import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock electron API for tests
const mockElectronAPI = {
    login: vi.fn(),
    logout: vi.fn(),
    checkLicense: vi.fn(),
    getSubscriptionStatus: vi.fn(),
    getUserInfo: vi.fn(),
    openBillingPortal: vi.fn(),
    getClients: vi.fn(),
    saveClient: vi.fn(),
    updateClient: vi.fn(),
    updateClientStatus: vi.fn(),
    deleteClient: vi.fn(),
    getTebligatlar: vi.fn(),
    convertStatement: vi.fn(),
    startScan: vi.fn(),
    resumeScan: vi.fn(),
    cancelScan: vi.fn(),
    getScanState: vi.fn(),
    onScanUpdate: vi.fn(),
    onScanError: vi.fn(),
    onScanComplete: vi.fn(),
    getScanSettings: vi.fn(),
    saveScanSettings: vi.fn(),
    getScheduleStatus: vi.fn(),
    setSchedule: vi.fn(),
    getCredits: vi.fn(),
    syncCredits: vi.fn(),
    purchaseCredits: vi.fn(),
    onCreditsUpdated: vi.fn(),
    exportCsv: vi.fn(),
    exportExcel: vi.fn(),
    openDocument: vi.fn(),
    shareDocument: vi.fn(),
    openDocumentsFolder: vi.fn(),
    getDocumentsPath: vi.fn(),
    removeScanListeners: vi.fn(),
    removeCreditsListeners: vi.fn(),
};

// @ts-expect-error Mock window.electronAPI
window.electronAPI = mockElectronAPI;

// Reset mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});
