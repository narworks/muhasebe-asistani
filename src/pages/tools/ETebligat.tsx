import React, { useState, useEffect, useRef } from 'react';
import { clientCreateSchema, clientEditSchema, validateForm } from '../../lib/validations';
import type { Client, Tebligat, ScanUpdate } from '../../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LegalConsentModal from '../../components/LegalConsentModal';
import LimitReachedModal from '../../components/LimitReachedModal';
import type {
    ClientGroup,
    ClientTestStatus,
    ScanResultItem,
    ScanHistoryItem,
    PreviewTebligat,
    PreviewClientResult,
    PreviewSelectionMode,
    LogEntry,
} from './e-tebligat/types';
import TebligatDetailModal from './e-tebligat/modals/TebligatDetailModal';
import ScanResultsModal from './e-tebligat/modals/ScanResultsModal';
import ScanHistoryModal from './e-tebligat/modals/ScanHistoryModal';
import PreviewModal from './e-tebligat/modals/PreviewModal';
import LogDrawer from './e-tebligat/LogDrawer';
import ClientManagement from './e-tebligat/ClientManagement';
import ScanControls from './e-tebligat/ScanControls';
import ResultsView from './e-tebligat/ResultsView';
import DaemonStatusPanel from './e-tebligat/DaemonStatusPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { toast } from 'sonner';
import DashboardCards from './e-tebligat/DashboardCards';

const ETebligat: React.FC = () => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('results');
    const [scanning, setScanning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [tebligatlar, setTebligatlar] = useState<Tebligat[]>([]);
    const [loadingTebligatlar, setLoadingTebligatlar] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [clientForm, setClientForm] = useState({
        firm_name: '',
        tax_number: '',
        gib_user_code: '',
        gib_password: '',
    });
    const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
    const [savingClient, setSavingClient] = useState(false);
    const [editingClientId, setEditingClientId] = useState<number | null>(null);
    const [selectedTebligat, setSelectedTebligat] = useState<Tebligat | null>(null);
    const [fetchingDocumentId, setFetchingDocumentId] = useState<number | null>(null);
    const [documentsFolder, setDocumentsFolder] = useState<string | null>(null);
    const [filterClientId, setFilterClientId] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterSender, setFilterSender] = useState('all');
    // 'all' shows everything; 'pending' shows unviewed (all dates); 'new' shows unviewed from today.
    // Set via ?filter=pending / ?filter=new URL param from the daemon popup.
    const [viewedFilter, setViewedFilter] = useState<'all' | 'pending' | 'new'>('all');
    const [filterDateRange, setFilterDateRange] = useState<
        'all' | 'today' | 'yesterday' | 'last3' | 'last7' | 'last30' | 'thisYear' | 'custom'
    >('all');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Progress & Schedule state
    const [scanProgress, setScanProgress] = useState<{
        current: number;
        total: number;
        currentClient: string | null;
        errors: number;
        successes: number;
        completed?: boolean;
    } | null>(null);

    const [scanState, setScanState] = useState<{
        canResume: boolean;
        processedCount: number;
        total: number;
        errors: number;
        successes: number;
        wasCancelled: boolean;
    } | null>(null);

    const [creditBalance, setCreditBalance] = useState<{ totalRemaining: number } | null>(null);
    const [insufficientCredits, setInsufficientCredits] = useState(false);
    const [subscriptionStatus, setSubscriptionStatus] = useState<{
        isActive: boolean;
        status: string;
        isTrial?: boolean;
        modules?: string[];
        plan?: string | null;
    } | null>(null);
    const navigateTo = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // Rate limits
    const [rateLimits, setRateLimits] = useState({
        dailyUsed: 0,
        dailyLimit: 50,
        hourlyUsed: 0,
        hourlyLimit: 10,
    });

    // New tebligat panel (shows after scan)
    const [newTebligatPanel, setNewTebligatPanel] = useState<{
        items: Array<{ clientName: string; clientId: number; tebligatIds: number[] }>;
        visible: boolean;
    }>({ items: [], visible: false });

    // Excel import
    const [importResult, setImportResult] = useState<{
        saved: number;
        errors: Array<{ row: number; firm_name: string; error: string }>;
        parseErrors: Array<{ row: number; error: string }>;
        limitError?: string;
    } | null>(null);
    const [importing, setImporting] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);

    // Password test per client: clientId -> { status, errorType? }
    const [clientTestStatus, setClientTestStatus] = useState<
        Record<number, { status: ClientTestStatus; errorType?: string; errorMessage?: string }>
    >({});

    // Scan results modal
    const [scanResultsModal, setScanResultsModal] = useState<ScanResultItem[] | null>(null);

    // Estimated scan duration
    const [scanEstimate, setScanEstimate] = useState<{
        count: number;
        estimatedMinutes: number;
    } | null>(null);

    // Last scan failed client IDs (for "retry failed" button)
    const [lastFailedIds, setLastFailedIds] = useState<number[]>([]);

    // Scan history modal
    const [scanHistoryModal, setScanHistoryModal] = useState<ScanHistoryItem[] | null>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

    // Preview scan flow
    const [previewRunning, setPreviewRunning] = useState(false);
    const [previewResults, setPreviewResults] = useState<PreviewClientResult[] | null>(null);
    const [previewSelections, setPreviewSelections] = useState<
        Record<number, PreviewSelectionMode>
    >({});

    // Client limit
    const [clientLimit, setClientLimit] = useState<{
        totalAdded: number;
        maxClients: number;
        remaining: number;
    } | null>(null);

    // Hard limit modal
    const [limitModal, setLimitModal] = useState<{
        resource: 'mukellef' | 'kredi';
        used?: number;
        limit?: number;
    } | null>(null);

    // Legal consent
    const [showLegalConsent, setShowLegalConsent] = useState(false);
    const [legalConsentAccepted, setLegalConsentAccepted] = useState(true); // assume true until checked

    // Accordion & Pagination state
    const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
    const [expandedScans, setExpandedScans] = useState<Set<string>>(new Set());

    // Deep-link from daemon popup:
    //   ?clientId=X → expand that client's accordion and scroll to it
    //   ?filter=pending → show only unviewed tebligat
    //   ?filter=new → show only unviewed tebligat from today
    // Consumed-once: params are cleared after applying so Back/Forward doesn't re-apply.
    useEffect(() => {
        let changed = false;
        const raw = searchParams.get('clientId');
        if (raw) {
            const id = Number(raw);
            if (Number.isFinite(id) && id > 0) {
                setExpandedClients((prev) => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                });
                setTimeout(() => {
                    const el = document.getElementById(`client-accordion-${id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
                changed = true;
            }
        }
        const filter = searchParams.get('filter');
        if (filter === 'pending' || filter === 'new') {
            setViewedFilter(filter);
            setActiveTab('results');
            changed = true;
        }
        if (changed) setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const fetchTebligatlar = async () => {
        setLoadingTebligatlar(true);
        try {
            const data = await window.electronAPI.getTebligatlar();
            setTebligatlar(data || []);
        } catch (err) {
            console.error('Tebligat verileri alınamadı', err);
        } finally {
            setLoadingTebligatlar(false);
        }
    };

    // Load rate limits on mount and refresh periodically
    useEffect(() => {
        const loadLimits = () =>
            window.electronAPI
                .getRateLimits()
                .then(setRateLimits)
                .catch(() => {});
        loadLimits();
        const interval = setInterval(loadLimits, 10000); // refresh every 10s
        return () => clearInterval(interval);
    }, []);

    // Check legal consent on mount
    useEffect(() => {
        window.electronAPI.getLegalConsent().then((accepted) => {
            setLegalConsentAccepted(accepted);
        });
    }, []);

    const fetchClients = async () => {
        try {
            const data = await window.electronAPI.getClients();
            setClients(data || []);
        } catch (err) {
            console.error('Mükellef listesi alınamadı', err);
        }
    };

    const fetchClientLimit = async () => {
        try {
            const limit = await window.electronAPI.getClientLimit();
            setClientLimit(limit);
        } catch {
            // Limit check failed, ignore
        }
    };

    useEffect(() => {
        const handleUpdate = (status: ScanUpdate) => {
            if (status.type === 'data-updated') {
                fetchTebligatlar();
                // Collect new tebligat IDs for the panel
                if (status.newTebligatIds && status.newTebligatIds.length > 0) {
                    setNewTebligatPanel((prev) => ({
                        visible: true,
                        items: [
                            ...prev.items,
                            {
                                clientName: status.clientName || '',
                                clientId: status.clientId || 0,
                                tebligatIds: status.newTebligatIds || [],
                            },
                        ],
                    }));
                }
                return;
            }
            if (status.type === 'progress') {
                // Refresh table when a new client starts (previous client data is saved)
                if (status.progress.currentClient && status.progress.current > 0) {
                    fetchTebligatlar();
                }
                setScanProgress(status.progress);
                if (status.progress.insufficientCredits) {
                    setInsufficientCredits(true);
                    toast.warning('Kredi yetersiz, tarama durduruldu');
                }
                if (status.progress.completed) {
                    fetchTebligatlar();
                    setScanState(null);
                    setInsufficientCredits(false);
                    toast.success(
                        `Tarama tamamlandı: ${status.progress.successes} başarılı${status.progress.errors > 0 ? `, ${status.progress.errors} hatalı` : ''}`
                    );
                }
            } else if (status.type === 'scan-state') {
                setScanState(status.scanState);
                setScanning(false);
            } else {
                addLog(status.message, status.type);
            }
        };

        const handleError = (errorMsg: string) => {
            addLog(errorMsg, 'error');
            toast.error(errorMsg);
            setScanning(false);
            setScanProgress(null);
            // Fetch scan state to check if resume is possible
            window.electronAPI
                .getScanState()
                .then((state) => {
                    if (state.canResume) setScanState(state);
                })
                .catch(() => {});
        };

        const handleComplete = async (msg: string) => {
            addLog(msg, 'success');
            setScanning(false);
            setScanProgress(null);
            setScanState(null);
            await fetchTebligatlar();
            // Fetch per-client scan results and show the summary modal
            try {
                const resp = await window.electronAPI.getLastScanResults();
                if (resp.ok && resp.results && resp.results.length > 0) {
                    setScanResultsModal(resp.results);
                }
            } catch {
                /* ignore */
            }
        };

        const removeScanUpdate = window.electronAPI.onScanUpdate(handleUpdate);
        const removeScanError = window.electronAPI.onScanError(handleError);
        const removeScanComplete = window.electronAPI.onScanComplete(handleComplete);

        return () => {
            removeScanUpdate();
            removeScanError();
            removeScanComplete();
        };
    }, []);

    useEffect(() => {
        fetchTebligatlar();
    }, []);
    useEffect(() => {
        fetchClients();
        fetchClientLimit();
        // Fetch estimated scan duration + last failed IDs
        window.electronAPI
            .estimateScanDuration()
            .then((est) => setScanEstimate(est))
            .catch(() => {});
        window.electronAPI
            .getLastScanFailedIds()
            .then((ids) => setLastFailedIds(ids))
            .catch(() => {});
    }, []);
    useEffect(() => {
        window.electronAPI
            .getDocumentsFolder()
            .then((folder: string | null) => {
                setDocumentsFolder(folder);
            })
            .catch(() => {});
    }, []);

    // Check subscription status
    useEffect(() => {
        window.electronAPI
            .getSubscriptionStatus()
            .then(setSubscriptionStatus)
            .catch(() => {
                setSubscriptionStatus({ isActive: false, status: 'unknown' });
            });
    }, []);

    // Fetch credits and listen for updates
    useEffect(() => {
        window.electronAPI
            .getCredits()
            .then(setCreditBalance)
            .catch(() => {});
        const removeCreditsListener = window.electronAPI.onCreditsUpdated((credits) => {
            setCreditBalance(credits);
        });
        return removeCreditsListener;
    }, []);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [logs]);

    const addLog = (message: string, type: 'info' | 'error' | 'success' | 'process' = 'info') => {
        setLogs((prev) => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
    };

    const handleStartScan = async () => {
        try {
            const sub = await window.electronAPI.getSubscriptionStatus();
            if (!sub.isActive) {
                if (sub.isTrial) {
                    addLog('Deneme süreniz dolmuştur. Tarama yapabilmek için abone olun.', 'error');
                } else {
                    addLog('Aktif aboneliğiniz bulunmamaktadır. Lütfen abone olun.', 'error');
                }
                return;
            }
            if (!sub.isTrial && !sub.modules?.includes('e_tebligat')) {
                addLog('E-Tebligat modülü aktif değil. Lütfen abone olun.', 'error');
                return;
            }
            if (sub.isTrial && sub.trialEndsAt) {
                const daysLeft = Math.max(
                    0,
                    Math.ceil(
                        (new Date(sub.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                );
                addLog(`Deneme sürümü — ${daysLeft} gün kaldı.`, 'info');
            }
        } catch (err) {
            addLog('Abonelik durumu doğrulanamadı.', 'error');
            return;
        }

        // Kredi kontrolü
        try {
            const credits = await window.electronAPI.getCredits();
            setCreditBalance(credits);
            if (credits.totalRemaining <= 0) {
                setLimitModal({
                    resource: 'kredi',
                    used: credits.monthlyUsed,
                    limit: credits.monthlyLimit,
                });
                return;
            }
            const activeClients = clients.filter((c) => c.status === 'active').length;
            if (credits.totalRemaining < activeClients) {
                addLog(
                    `Dikkat: ${credits.totalRemaining} krediniz kaldı, ${activeClients} aktif mükellef var. Kredi bitince tarama duracaktır.`,
                    'info'
                );
            }
        } catch {
            // Credit check failed, continue with scan
        }

        setScanning(true);
        setLogs([]);
        setScanProgress(null);
        setScanState(null);
        setInsufficientCredits(false);
        setTebligatlar([]); // Listeyi sıfırla
        setNewTebligatPanel({ items: [], visible: false }); // Reset panel
        addLog('Tarama başlatılıyor...', 'info');
        window.electronAPI.startScan();
    };

    const handleResumeScan = async () => {
        try {
            const sub = await window.electronAPI.getSubscriptionStatus();
            if (!sub.isActive) {
                addLog('Aktif aboneliğiniz bulunmamaktadır. Lütfen abone olun.', 'error');
                return;
            }
        } catch (err) {
            addLog('Abonelik durumu doğrulanamadı.', 'error');
            return;
        }

        setScanning(true);
        setScanState(null);
        addLog('Tarama kaldığı yerden devam ediyor...', 'info');
        window.electronAPI.resumeScan();
    };

    const handleStopScan = () => {
        window.electronAPI.cancelScan();
        setScanning(false);
        setScanProgress(null);
        addLog('Tarama durduruldu.', 'info');
    };

    const handleSaveClient = async (event: React.FormEvent) => {
        event.preventDefault();
        setClientErrors({});

        // Show legal consent if not accepted yet (first time adding a client)
        if (!editingClientId && !legalConsentAccepted) {
            setShowLegalConsent(true);
            return;
        }

        // Use appropriate schema based on edit vs create mode
        const schema = editingClientId ? clientEditSchema : clientCreateSchema;
        const result = validateForm(schema, clientForm);

        if (!result.success) {
            setClientErrors((result as { success: false; errors: Record<string, string> }).errors);
            return;
        }

        setSavingClient(true);
        try {
            const payload = {
                firm_name: result.data.firm_name.trim(),
                tax_number: result.data.tax_number?.trim() || '',
                gib_user_code: result.data.gib_user_code.trim(),
                gib_password: result.data.gib_password || '',
            };

            if (editingClientId) {
                await window.electronAPI.updateClient(editingClientId, payload);
            } else {
                // Short-circuit if mukellef limit is reached
                if (clientLimit && clientLimit.remaining <= 0) {
                    setLimitModal({
                        resource: 'mukellef',
                        used: clientLimit.totalAdded,
                        limit: clientLimit.maxClients,
                    });
                    return;
                }
                await window.electronAPI.saveClient(payload);
            }

            setClientForm({ firm_name: '', tax_number: '', gib_user_code: '', gib_password: '' });
            setEditingClientId(null);
            toast.success('Mükellef kaydedildi');
            await fetchClients();
            fetchClientLimit();
        } catch (err: unknown) {
            setClientErrors({
                _form: err instanceof Error ? err.message : 'Mükellef kaydedilemedi.',
            });
        } finally {
            setSavingClient(false);
        }
    };

    const handleEditClient = (client: Client) => {
        setEditingClientId(client.id);
        setClientForm({
            firm_name: client.firm_name || '',
            tax_number: client.tax_number || '',
            gib_user_code: client.gib_user_code || '',
            gib_password: '',
        });
        setClientErrors({});
    };

    const handleCancelEdit = () => {
        setEditingClientId(null);
        setClientForm({ firm_name: '', tax_number: '', gib_user_code: '', gib_password: '' });
        setClientErrors({});
    };

    // Clear field error on change
    const handleClientFieldChange = (field: string, value: string) => {
        setClientForm((prev) => ({ ...prev, [field]: value }));
        if (clientErrors[field]) {
            setClientErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset file input
        if (importFileRef.current) importFileRef.current.value = '';

        setImporting(true);
        setImportResult(null);
        try {
            const buffer = await file.arrayBuffer();
            const result = await window.electronAPI.importClientsFromExcel(buffer);
            setImportResult(result);
            if (result.saved > 0) {
                toast.success(`${result.saved} mükellef eklendi`);
                await fetchClients();
                fetchClientLimit();
            }
            if (result.parseErrors?.length > 0)
                toast.error(`${result.parseErrors.length} satırda hata`);
        } catch (err) {
            setImportResult({
                saved: 0,
                errors: [],
                parseErrors: [{ row: 0, error: (err as Error).message }],
            });
        } finally {
            setImporting(false);
        }
    };

    const handleToggleClientStatus = async (client: Client) => {
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        await window.electronAPI.updateClientStatus(client.id, newStatus);
        await fetchClients();
    };

    const handleDeleteClient = async (client: Client) => {
        if (!confirm(`${client.firm_name} kaydını silmek istediğinize emin misiniz?`)) {
            return;
        }
        await window.electronAPI.deleteClient(client.id);
        toast.success(`${client.firm_name} silindi`);
        await fetchClients();
    };

    const handleTestLogin = async (client: Client) => {
        setClientTestStatus((p) => ({
            ...p,
            [client.id]: { status: 'running' },
        }));
        try {
            const result = await window.electronAPI.testClientLogin(client.id);
            setClientTestStatus((p) => ({
                ...p,
                [client.id]: {
                    status: result.success ? 'ok' : 'fail',
                    errorType: result.errorType,
                    errorMessage: result.errorMessage,
                },
            }));
        } catch (err) {
            setClientTestStatus((p) => ({
                ...p,
                [client.id]: {
                    status: 'fail',
                    errorType: 'unknown',
                    errorMessage: (err as Error).message,
                },
            }));
        }
    };

    const escapeCsvValue = (value: unknown) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const handleOpenDocument = async (documentPath: string, tebligatId?: number) => {
        try {
            const result = await window.electronAPI.openDocument(documentPath);
            if (!result.success) {
                addLog(`Döküman açılamadı: ${result.error}`, 'error');
            } else if (tebligatId) {
                // Tray badge / popup banner track app_viewed_at — mark after successful open.
                window.electronAPI.markTebligatViewed(tebligatId).catch(() => {});
            }
        } catch (err: unknown) {
            addLog(
                `Döküman açılamadı: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    const handleFetchDocument = async (tebligatId: number) => {
        setFetchingDocumentId(tebligatId);
        try {
            const result = await window.electronAPI.fetchTebligatDocument(tebligatId);
            if (result.success) {
                window.electronAPI.markTebligatViewed(tebligatId).catch(() => {});
                await fetchTebligatlar();
                // Update selected tebligat in the modal if it's open
                setSelectedTebligat((prev: Tebligat | null) =>
                    prev?.id === tebligatId ? { ...prev, document_path: result.path } : prev
                );
                addLog('Döküman başarıyla indirildi.', 'success');
            } else {
                addLog(`Döküman indirilemedi: ${result.error}`, 'error');
            }
        } catch (err: unknown) {
            addLog(
                `Döküman indirilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        } finally {
            setFetchingDocumentId(null);
        }
    };

    const handleShareDocument = async (documentPath: string) => {
        try {
            const result = await window.electronAPI.shareDocument(documentPath);
            if (!result.success) {
                addLog(`Klasör açılamadı: ${result.error}`, 'error');
            }
        } catch (err: unknown) {
            addLog(
                `Klasör açılamadı: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    const handleSelectDocumentsFolder = async () => {
        try {
            const result = await window.electronAPI.selectDocumentsFolder();
            if (result.success) {
                setDocumentsFolder(result.path ?? null);
                addLog(`Döküman klasörü değiştirildi: ${result.path}`, 'success');
            }
        } catch (err: unknown) {
            addLog(
                `Klasör seçilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    const handleOpenDocumentsFolder = async () => {
        try {
            const result = await window.electronAPI.openDocumentsFolder();
            if (!result.success) {
                addLog(`Döküman klasörü açılamadı: ${result.error}`, 'error');
            }
        } catch (err: unknown) {
            addLog(
                `Döküman klasörü açılamadı: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    // Accordion toggle
    const toggleClientAccordion = (clientId: number) => {
        setExpandedClients((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(clientId)) {
                newSet.delete(clientId);
            } else {
                newSet.add(clientId);
            }
            return newSet;
        });
    };

    const toggleScanAccordion = (key: string) => {
        setExpandedScans((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key);
            else newSet.add(key);
            return newSet;
        });
    };

    const handleExportCsv = async () => {
        if (filteredTebligatlar.length === 0) return;
        const headers = ['Mükellef', 'Tarih', 'Gönderen', 'Konu', 'Durum', 'Tarama Tarihi'];
        const rows = filteredTebligatlar.map((row) => [
            escapeCsvValue(row.firm_name),
            escapeCsvValue(row.tebligat_date),
            escapeCsvValue(row.sender),
            escapeCsvValue(row.subject),
            escapeCsvValue(row.status),
            escapeCsvValue(row.created_at),
        ]);

        const csvContent = [
            headers.map(escapeCsvValue).join(','),
            ...rows.map((r) => r.join(',')),
        ].join('\n');
        const fileName = `tebligatlar_${new Date().toISOString().slice(0, 10)}.csv`;

        try {
            const result = await window.electronAPI.exportCsv(csvContent, fileName);
            if (result.success) {
                addLog(`CSV dosyası kaydedildi: ${result.filePath}`, 'success');
            } else if (!result.canceled) {
                addLog(`CSV kaydedilemedi: ${result.error}`, 'error');
            }
        } catch (err: unknown) {
            addLog(
                `CSV kaydedilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    const handleExportExcel = async () => {
        if (filteredTebligatlar.length === 0) return;

        const dataRows = filteredTebligatlar.map((row) => ({
            Mükellef: row.firm_name || '',
            Tarih: row.tebligat_date || '',
            Gönderen: row.sender || '',
            Konu: row.subject || '',
            Durum: row.status || '',
            'Tarama Tarihi': row.created_at || '',
        }));

        const fileName = `tebligatlar_${new Date().toISOString().slice(0, 10)}.xlsx`;

        try {
            const result = await window.electronAPI.exportExcel(dataRows, 'Tebligatlar', fileName);
            if (result.success) {
                addLog(`Excel dosyası kaydedildi: ${result.filePath}`, 'success');
            } else if (!result.canceled) {
                addLog(`Excel kaydedilemedi: ${result.error}`, 'error');
            }
        } catch (err: unknown) {
            addLog(
                `Excel kaydedilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
                'error'
            );
        }
    };

    const statusOptions: string[] = [
        'Okunmuş',
        'Okunmamış',
        ...Array.from(
            new Set(
                tebligatlar
                    .map((row) => row.status)
                    .filter((s): s is string => !!s && s !== 'Okunmuş' && s !== 'Okunmamış')
            )
        ),
    ];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    // Unique sender list for dropdown (sorted, non-empty)
    const uniqueSenders = Array.from(
        new Set(tebligatlar.map((t) => t.sender).filter((s): s is string => !!s && s !== '-'))
    ).sort((a, b) => a.localeCompare(b, 'tr'));

    // Compute active date range based on preset
    const getDateRangeBounds = (): { from: Date | null; to: Date | null } => {
        const now = new Date();
        const startOfDay = (d: Date) =>
            new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const endOfDay = (d: Date) =>
            new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        switch (filterDateRange) {
            case 'today':
                return { from: startOfDay(now), to: endOfDay(now) };
            case 'yesterday': {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                return { from: startOfDay(y), to: endOfDay(y) };
            }
            case 'last3': {
                const d = new Date(now);
                d.setDate(d.getDate() - 2);
                return { from: startOfDay(d), to: endOfDay(now) };
            }
            case 'last7': {
                const d = new Date(now);
                d.setDate(d.getDate() - 6);
                return { from: startOfDay(d), to: endOfDay(now) };
            }
            case 'last30': {
                const d = new Date(now);
                d.setDate(d.getDate() - 29);
                return { from: startOfDay(d), to: endOfDay(now) };
            }
            case 'thisYear':
                return {
                    from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
                    to: endOfDay(now),
                };
            case 'custom':
                return {
                    from: filterDateFrom ? new Date(filterDateFrom + 'T00:00:00') : null,
                    to: filterDateTo ? new Date(filterDateTo + 'T23:59:59') : null,
                };
            default:
                return { from: null, to: null };
        }
    };
    const dateBounds = getDateRangeBounds();

    // Parse row date — try tebligat_date (Turkish DD.MM.YYYY) then created_at (ISO)
    const parseRowDate = (row: Tebligat): Date | null => {
        if (row.tebligat_date && /^\d{2}\.\d{2}\.\d{4}/.test(row.tebligat_date)) {
            const [d, m, y] = row.tebligat_date.split(' ')[0].split('.').map(Number);
            return new Date(y, m - 1, d);
        }
        if (row.created_at) {
            const parsed = new Date(row.created_at);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return null;
    };

    const startOfTodayMsForFilter = React.useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, []);
    const filteredTebligatlar = tebligatlar.filter((row) => {
        if (filterClientId !== 'all' && String(row.client_id) !== filterClientId) return false;
        if (filterStatus !== 'all' && row.status !== filterStatus) return false;
        if (filterSender !== 'all' && row.sender !== filterSender) return false;
        if (dateBounds.from || dateBounds.to) {
            const rowDate = parseRowDate(row);
            if (!rowDate) return false;
            if (dateBounds.from && rowDate < dateBounds.from) return false;
            if (dateBounds.to && rowDate > dateBounds.to) return false;
        }
        if (viewedFilter === 'pending' || viewedFilter === 'new') {
            if (row.app_viewed_at) return false;
            if (viewedFilter === 'new') {
                const ref = row.notification_date || row.send_date || row.created_at;
                if (!ref) return false;
                const ts = new Date(ref).getTime();
                if (Number.isNaN(ts) || ts < startOfTodayMsForFilter) return false;
            }
        }
        if (normalizedSearch) {
            const haystack =
                `${row.firm_name || ''} ${row.sender || ''} ${row.subject || ''}`.toLowerCase();
            if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
    });

    // Group tebligatlar by client, then by scan date
    const groupedByClient = filteredTebligatlar.reduce(
        (acc, row) => {
            const clientId = row.client_id;
            if (!acc[clientId]) {
                acc[clientId] = {
                    client_id: clientId,
                    firm_name: row.firm_name ?? '',
                    tebligatlar: [],
                    scanGroups: [],
                };
            }
            acc[clientId].tebligatlar.push(row);
            return acc;
        },
        {} as Record<number, ClientGroup>
    );

    // Build scan groups for each client
    for (const group of Object.values(groupedByClient)) {
        const byDate: Record<string, Tebligat[]> = {};
        for (const t of group.tebligatlar) {
            // Group by created_at date (truncated to day)
            const dateKey = t.created_at
                ? new Date(t.created_at).toLocaleDateString('tr-TR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                  })
                : 'Tarih bilinmiyor';
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(t);
        }
        group.scanGroups = Object.entries(byDate)
            .map(([dateLabel, items]) => {
                const firstDate = items[0]?.created_at;
                const timeLabel = firstDate
                    ? new Date(firstDate).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                      })
                    : '';
                return {
                    scanDate: firstDate || '',
                    scanLabel: `${dateLabel} - ${timeLabel}`,
                    tebligatlar: items,
                };
            })
            .sort(
                (a, b) => new Date(b.scanDate || 0).getTime() - new Date(a.scanDate || 0).getTime()
            );
    }

    const clientGroups: ClientGroup[] = (Object.values(groupedByClient) as ClientGroup[]).sort(
        (a, b) => (a.firm_name || '').localeCompare(b.firm_name || '', 'tr')
    );

    // Flat set of all new tebligat IDs from last scan (for highlighting)
    const allNewTebligatIds = new Set(newTebligatPanel.items.flatMap((g) => g.tebligatIds));

    // New tebligat details for the side panel
    const newTebligatDetails =
        allNewTebligatIds.size > 0 ? tebligatlar.filter((t) => allNewTebligatIds.has(t.id)) : [];

    const resetFilters = () => {
        setFilterClientId('all');
        setFilterStatus('all');
        setFilterSender('all');
        setFilterDateRange('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setSearchTerm('');
    };

    const progressPercent =
        scanProgress && scanProgress.total > 0
            ? Math.round((scanProgress.current / scanProgress.total) * 100)
            : 0;

    // Preview download handler
    const handlePreviewDownload = async () => {
        if (!previewResults) return;

        const parseDate = (s: string | null): Date | null => {
            if (!s) return null;
            const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        };
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const last15 = new Date(now.getTime() - 15 * 86400000);
        const last30 = new Date(now.getTime() - 30 * 86400000);
        const last6m = new Date(now.getTime() - 180 * 86400000);

        const getSelectedForClient = (r: PreviewClientResult): PreviewTebligat[] => {
            const mode = previewSelections[r.clientId] || 'skip';
            if (!r.tebligatList || mode === 'skip') return [];
            if (mode === 'all') return r.tebligatList;
            let from: Date | null = null;
            if (mode === 'last15') from = last15;
            else if (mode === 'last30') from = last30;
            else if (mode === 'last6m') from = last6m;
            else if (mode === 'thisYear') from = startOfYear;
            if (!from) return r.tebligatList;
            return r.tebligatList.filter((t) => {
                const d = parseDate(t.notificationDate || t.sendDate);
                return d !== null && d >= (from as Date);
            });
        };

        // Calculate filter date for each mode
        const modeToFilterDate = (mode: string): string | null => {
            if (mode === 'all' || mode === 'skip') return null;
            if (mode === 'last15') return last15.toISOString().split('T')[0];
            if (mode === 'last30') return last30.toISOString().split('T')[0];
            if (mode === 'last6m') return last6m.toISOString().split('T')[0];
            if (mode === 'thisYear') return startOfYear.toISOString().split('T')[0];
            return null;
        };

        const selections = previewResults
            .filter((r) => r.ok)
            .map((r) => {
                const selected = getSelectedForClient(r);
                const selectedNos = new Set(selected.map((t) => t.belgeNo));
                const skippedNos = (r.tebligatList || [])
                    .filter((t) => !selectedNos.has(t.belgeNo))
                    .map((t) => t.belgeNo);
                const mode = previewSelections[r.clientId] || 'skip';
                return {
                    clientId: r.clientId,
                    firmName: r.firmName,
                    tebligatList: selected,
                    skippedDocumentNos: skippedNos,
                    scanDateFilter: modeToFilterDate(mode),
                };
            })
            // Keep skip-only clients (0 selected, >0 skipped) so backend marks them as scanned.
            .filter((s) => s.tebligatList.length > 0 || s.skippedDocumentNos.length > 0);

        if (selections.length === 0) {
            addLog('Hiçbir tebligat seçilmedi', 'info');
            return;
        }

        setPreviewResults(null);
        setScanning(true);
        setLogs([]);
        addLog(
            `${selections.reduce((s, x) => s + x.tebligatList.length, 0)} tebligat indiriliyor...`,
            'info'
        );

        try {
            const result = await window.electronAPI.downloadSelectedTebligatlar(selections);
            if (result.ok) {
                addLog(
                    `Tamamlandı: ${result.downloaded || 0} belge indirildi, ${result.errors || 0} hata`,
                    'success'
                );
            } else {
                addLog(`Hata: ${result.error || 'Bilinmeyen'}`, 'error');
            }
            await fetchTebligatlar();
            await fetchClients();
        } catch (err) {
            addLog(`Hata: ${(err as Error).message}`, 'error');
        } finally {
            setScanning(false);
        }
    };

    // Show subscription inactive screen
    if (subscriptionStatus && !subscriptionStatus.isActive) {
        return (
            <div className="p-6 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">E-Tebligat Tarama</h1>
                        <p className="text-slate-500 text-sm mt-1">
                            GİB E-Tebligat kutunuzdaki yeni tebligatları otomatik tarar
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-8 w-8 text-amber-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-3">Abonelik Gerekli</h2>
                        <p className="text-slate-600 mb-6">
                            Bu özelliği kullanabilmek için aktif bir aboneliğe sahip olmanız
                            gerekmektedir. Abonelik durumunuz:{' '}
                            <span className="text-amber-600 font-medium">Pasif</span>
                        </p>
                        <button
                            onClick={() => navigateTo('/subscription')}
                            className="inline-flex items-center px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg transition-colors"
                        >
                            Abonelik Sayfasına Git
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 h-full flex flex-col">
            <LimitReachedModal
                open={limitModal !== null}
                onClose={() => setLimitModal(null)}
                resource={limitModal?.resource ?? 'mukellef'}
                used={limitModal?.used}
                limit={limitModal?.limit}
                isTrial={clientLimit?.maxClients === 20}
            />
            {showLegalConsent && (
                <LegalConsentModal
                    onAccept={async () => {
                        await window.electronAPI.acceptLegalConsent();
                        setLegalConsentAccepted(true);
                        setShowLegalConsent(false);
                    }}
                    onDecline={() => setShowLegalConsent(false)}
                />
            )}

            {/* TebligatDetailModal */}
            {selectedTebligat && (
                <TebligatDetailModal
                    tebligat={selectedTebligat}
                    onClose={() => setSelectedTebligat(null)}
                    fetchingDocumentId={fetchingDocumentId}
                    onFetchDocument={handleFetchDocument}
                    onOpenDocument={handleOpenDocument}
                    onShareDocument={handleShareDocument}
                />
            )}

            <DashboardCards
                tebligatCount={tebligatlar.length}
                newTebligatCount={newTebligatPanel.items.reduce(
                    (s, i) => s + i.tebligatIds.length,
                    0
                )}
                clientCount={clients.length}
                maxClients={clientLimit?.maxClients || 200}
                creditBalance={creditBalance?.totalRemaining ?? null}
                onTabChange={setActiveTab}
            />

            {/* PreviewModal */}
            {previewResults && (
                <PreviewModal
                    results={previewResults}
                    selections={previewSelections}
                    onSelectionChange={(clientId, mode) =>
                        setPreviewSelections((prev) => ({
                            ...prev,
                            [clientId]: mode,
                        }))
                    }
                    onSetAllMode={(mode) => {
                        const next: Record<number, PreviewSelectionMode> = {};
                        previewResults.forEach((r) => {
                            next[r.clientId] = mode;
                        });
                        setPreviewSelections(next);
                    }}
                    onClose={() => setPreviewResults(null)}
                    onDownload={handlePreviewDownload}
                    downloading={scanning}
                />
            )}

            {/* ScanHistoryModal */}
            {scanHistoryModal && (
                <ScanHistoryModal
                    data={scanHistoryModal}
                    onClose={() => setScanHistoryModal(null)}
                    expandedHistoryId={expandedHistoryId}
                    onToggleExpand={(id) =>
                        setExpandedHistoryId(expandedHistoryId === id ? null : id)
                    }
                    diagnosticEnabled={currentUser?.diagnosticEnabled === true}
                />
            )}

            {/* ScanResultsModal */}
            {scanResultsModal && (
                <ScanResultsModal
                    data={scanResultsModal}
                    onClose={() => setScanResultsModal(null)}
                    onRetryFailed={(failedIds) => {
                        setLastFailedIds(failedIds);
                        setScanResultsModal(null);
                    }}
                />
            )}

            <div className="bg-white p-6 rounded-lg shadow-md flex-1 flex flex-col overflow-hidden">
                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex-1 flex flex-col"
                >
                    <TabsList className="w-full justify-start bg-gray-100 p-1 mb-2">
                        <TabsTrigger value="results">
                            Sonu&ccedil;lar{' '}
                            <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                                {tebligatlar.length}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="clients">
                            M&uuml;kellefler{' '}
                            <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                                {clients.length}
                            </span>
                        </TabsTrigger>
                    </TabsList>

                    {/* Sonuçlar Tab — compact daemon + scan strip at top; everything scrolls
                        together so long tebligat lists are fully accessible */}
                    <TabsContent value="results" className="flex-1 overflow-y-auto pt-2">
                        <DaemonStatusPanel compact />
                        <ScanControls
                            compact
                            scanning={scanning}
                            scanProgress={scanProgress}
                            scanState={scanState}
                            rateLimits={rateLimits}
                            scanEstimate={scanEstimate}
                            insufficientCredits={insufficientCredits}
                            lastFailedIds={lastFailedIds}
                            progressPercent={progressPercent}
                            clientCount={clients.length}
                            onStartScan={handleStartScan}
                            onStopScan={handleStopScan}
                            onResumeScan={handleResumeScan}
                            onPurchaseCredits={() => window.electronAPI.purchaseCredits()}
                            onRetryFailed={() => {
                                setScanning(true);
                                setLogs([]);
                                setScanProgress(null);
                                addLog(
                                    `${lastFailedIds.length} ba\u015Far\u0131s\u0131z m\u00FCkellef yeniden taran\u0131yor...`,
                                    'info'
                                );
                                window.electronAPI.startScanWithOptions({
                                    clientIds: lastFailedIds,
                                    scanType: 'retry_failed',
                                });
                            }}
                            onOpenHistory={async () => {
                                try {
                                    const history = await window.electronAPI.getScanHistory(20);
                                    setScanHistoryModal(history as ScanHistoryItem[]);
                                } catch {
                                    /* ignore */
                                }
                            }}
                            onStartPreview={async () => {
                                setPreviewRunning(true);
                                setPreviewResults(null);
                                setPreviewSelections({});
                                setScanProgress(null);
                                addLog(
                                    'Ke\u015fif ba\u015flat\u0131l\u0131yor (belge indirme yok)...',
                                    'info'
                                );
                                try {
                                    const result = await window.electronAPI.previewScan();
                                    if (result.ok && result.results) {
                                        setPreviewResults(result.results);
                                        const defaults: Record<number, PreviewSelectionMode> = {};
                                        result.results.forEach((r) => {
                                            if (r.ok && (r.count || 0) > 0) {
                                                defaults[r.clientId] = 'last30';
                                            } else {
                                                defaults[r.clientId] = 'skip';
                                            }
                                        });
                                        setPreviewSelections(defaults);
                                        toast.info(
                                            `Keşif tamamlandı: ${result.results.length} mükellef tarandı`
                                        );
                                    } else {
                                        addLog(
                                            `Ke\u015fif hatas\u0131: ${result.error || 'Bilinmeyen hata'}`,
                                            'error'
                                        );
                                    }
                                } catch (err) {
                                    addLog(
                                        `Ke\u015fif hatas\u0131: ${(err as Error).message}`,
                                        'error'
                                    );
                                } finally {
                                    setPreviewRunning(false);
                                    // Preview doesn't go through handleComplete/handleError,
                                    // so reset scanProgress here — otherwise buttons stay hidden.
                                    setScanProgress(null);
                                }
                            }}
                            previewRunning={previewRunning}
                            hasNewClients={clients.filter((c) => !c.last_full_scan_at).length > 0}
                            newClientsCount={clients.filter((c) => !c.last_full_scan_at).length}
                        />

                        {/* LogDrawer — only shown during manual scans (daemon activity is in DaemonStatusPanel) */}
                        {(scanning || logs.length > 0) && (
                            <div className="mt-4">
                                <LogDrawer logs={logs} logsEndRef={logsEndRef} />
                            </div>
                        )}

                        <div className="mt-2">
                            <ResultsView
                                tebligatlar={tebligatlar}
                                filteredTebligatlar={filteredTebligatlar}
                                clientGroups={clientGroups}
                                clients={clients}
                                allNewTebligatIds={allNewTebligatIds}
                                loadingTebligatlar={loadingTebligatlar}
                                filterDateRange={filterDateRange}
                                filterDateFrom={filterDateFrom}
                                filterDateTo={filterDateTo}
                                filterClientId={filterClientId}
                                filterStatus={filterStatus}
                                filterSender={filterSender}
                                searchTerm={searchTerm}
                                onFilterDateRange={setFilterDateRange}
                                onFilterDateFrom={setFilterDateFrom}
                                onFilterDateTo={setFilterDateTo}
                                onFilterClientId={setFilterClientId}
                                onFilterStatus={setFilterStatus}
                                onFilterSender={setFilterSender}
                                onSearchTerm={setSearchTerm}
                                statusOptions={statusOptions}
                                uniqueSenders={uniqueSenders}
                                expandedClients={expandedClients}
                                expandedScans={expandedScans}
                                onToggleClient={toggleClientAccordion}
                                onToggleScan={toggleScanAccordion}
                                onSelectTebligat={setSelectedTebligat}
                                onFetchDocument={handleFetchDocument}
                                onOpenDocument={handleOpenDocument}
                                onShareDocument={handleShareDocument}
                                fetchingDocumentId={fetchingDocumentId}
                                documentsFolder={documentsFolder}
                                onOpenDocumentsFolder={handleOpenDocumentsFolder}
                                onSelectDocumentsFolder={handleSelectDocumentsFolder}
                                onExportCsv={handleExportCsv}
                                onExportExcel={handleExportExcel}
                                onRefresh={fetchTebligatlar}
                                onResetFilters={resetFilters}
                            />
                        </div>
                    </TabsContent>

                    {/* Mükellefler Tab */}
                    <TabsContent
                        value="clients"
                        forceMount
                        className="flex-1 overflow-y-auto pt-2 data-[state=inactive]:hidden"
                    >
                        <ClientManagement
                            clients={clients}
                            clientForm={clientForm}
                            clientErrors={clientErrors}
                            savingClient={savingClient}
                            editingClientId={editingClientId}
                            importing={importing}
                            importResult={importResult}
                            importFileRef={importFileRef}
                            clientTestStatus={clientTestStatus}
                            clientLimit={clientLimit}
                            onClose={() => {}}
                            onSaveClient={handleSaveClient}
                            onEditClient={handleEditClient}
                            onCancelEdit={handleCancelEdit}
                            onFieldChange={handleClientFieldChange}
                            onExcelImport={handleExcelImport}
                            onDownloadTemplate={async () => {
                                await window.electronAPI.downloadExcelTemplate();
                            }}
                            onToggleStatus={handleToggleClientStatus}
                            onDeleteClient={handleDeleteClient}
                            onTestLogin={handleTestLogin}
                            onClearImportResult={() => setImportResult(null)}
                            onScanNow={async (client) => {
                                toast.loading(`${client.firm_name} taranıyor...`, {
                                    id: `scan-${client.id}`,
                                });
                                try {
                                    const result = await window.electronAPI.scanSingleClient(
                                        client.id
                                    );
                                    if (result.success) {
                                        toast.success(
                                            `${client.firm_name}: ${result.newTebligatCount || 0} yeni tebligat`,
                                            { id: `scan-${client.id}` }
                                        );
                                        fetchTebligatlar();
                                    } else {
                                        toast.error(
                                            `${client.firm_name}: ${result.errorMessage || 'Hata'}`,
                                            { id: `scan-${client.id}` }
                                        );
                                    }
                                } catch (err) {
                                    toast.error(
                                        `${client.firm_name}: ${err instanceof Error ? err.message : 'Hata'}`,
                                        { id: `scan-${client.id}` }
                                    );
                                }
                            }}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Right Side Panel — New Tebligatlar Detail */}
            {newTebligatPanel.visible && newTebligatDetails.length > 0 && (
                <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-emerald-50">
                        <h3 className="text-base font-bold text-emerald-800">
                            Yeni Tebligatlar ({newTebligatDetails.length})
                        </h3>
                        <button
                            onClick={() =>
                                setNewTebligatPanel((prev) => ({ ...prev, visible: false }))
                            }
                            className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                        >
                            Kapat
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {newTebligatPanel.items.map((group, gIdx) => {
                            const groupDetails = newTebligatDetails.filter(
                                (t) => t.client_id === group.clientId
                            );
                            if (groupDetails.length === 0) return null;
                            return (
                                <div key={gIdx}>
                                    <div className="px-5 py-3 bg-slate-700 border-b border-slate-600 sticky top-0">
                                        <span className="text-sm font-bold text-white">
                                            {group.clientName}
                                        </span>
                                        <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium">
                                            {groupDetails.length} yeni
                                        </span>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {groupDetails.map((t) => (
                                            <div
                                                key={t.id}
                                                className="px-5 py-3 hover:bg-emerald-50/50 cursor-pointer"
                                                onClick={() => setSelectedTebligat(t)}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-mono text-gray-500 mb-0.5">
                                                            {t.document_no || '-'}
                                                        </p>
                                                        <p className="text-sm text-gray-800 font-medium truncate">
                                                            {t.subject || '-'}
                                                        </p>
                                                        <p className="text-xs text-gray-500 truncate">
                                                            {t.sender || '-'}
                                                        </p>
                                                    </div>
                                                    <div
                                                        className="flex items-center gap-1.5 flex-shrink-0"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {t.document_path ? (
                                                            <>
                                                                <button
                                                                    onClick={() =>
                                                                        handleOpenDocument(
                                                                            t.document_path!,
                                                                            t.id
                                                                        )
                                                                    }
                                                                    className="p-1 text-sky-600 hover:bg-sky-50 rounded"
                                                                    title="A&ccedil;"
                                                                >
                                                                    <svg
                                                                        xmlns="http://www.w3.org/2000/svg"
                                                                        className="h-4 w-4"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                                        />
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                                        />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        handleShareDocument(
                                                                            t.document_path!
                                                                        )
                                                                    }
                                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                                                    title="Klas&ouml;r"
                                                                >
                                                                    <svg
                                                                        xmlns="http://www.w3.org/2000/svg"
                                                                        className="h-4 w-4"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                                                        />
                                                                    </svg>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() =>
                                                                    handleFetchDocument(t.id)
                                                                }
                                                                disabled={
                                                                    fetchingDocumentId === t.id
                                                                }
                                                                className="p-1 text-amber-500 hover:bg-amber-50 rounded disabled:opacity-50"
                                                                title="&#304;ndir"
                                                            >
                                                                {fetchingDocumentId === t.id ? (
                                                                    <svg
                                                                        className="animate-spin h-4 w-4"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                    >
                                                                        <circle
                                                                            className="opacity-25"
                                                                            cx="12"
                                                                            cy="12"
                                                                            r="10"
                                                                            stroke="currentColor"
                                                                            strokeWidth="4"
                                                                        />
                                                                        <path
                                                                            className="opacity-75"
                                                                            fill="currentColor"
                                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                                        />
                                                                    </svg>
                                                                ) : (
                                                                    <svg
                                                                        xmlns="http://www.w3.org/2000/svg"
                                                                        className="h-4 w-4"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                                        />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ETebligat;
