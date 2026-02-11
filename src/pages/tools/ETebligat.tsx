import React, { useState, useEffect, useRef } from 'react';

const ETebligat: React.FC = () => {
    const [scanning, setScanning] = useState(false);
    const [logs, setLogs] = useState<{ message: string; type: 'info' | 'error' | 'success' | 'process'; timestamp: string }[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [tebligatlar, setTebligatlar] = useState<any[]>([]);
    const [loadingTebligatlar, setLoadingTebligatlar] = useState(false);
    const [clients, setClients] = useState<any[]>([]);
    const [clientForm, setClientForm] = useState({
        firm_name: '',
        tax_number: '',
        gib_user_code: '',
        gib_password: ''
    });
    const [clientError, setClientError] = useState<string | null>(null);
    const [savingClient, setSavingClient] = useState(false);
    const [editingClientId, setEditingClientId] = useState<number | null>(null);
    const [selectedTebligat, setSelectedTebligat] = useState<any | null>(null);
    const [filterClientId, setFilterClientId] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
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

    const [scheduleConfig, setScheduleConfig] = useState({
        enabled: false,
        time: '08:00',
        finishByTime: '08:00',
        frequency: 'daily' as 'daily' | 'weekdays' | 'weekends' | 'custom',
        customDays: [] as number[],
        lastScheduledScanAt: null as string | null,
        nextScheduledScanAt: null as string | null,
        estimatedStartTime: null as string | null,
        estimatedDurationMinutes: 0,
        clientCount: 0
    });
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [creditBalance, setCreditBalance] = useState<{ totalRemaining: number } | null>(null);
    const [insufficientCredits, setInsufficientCredits] = useState(false);
    const [subscriptionStatus, setSubscriptionStatus] = useState<{ isActive: boolean; status: string } | null>(null);

    // Accordion & Pagination state
    const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
    const [clientPages, setClientPages] = useState<Record<number, number>>({});
    const ITEMS_PER_PAGE = 10;

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

    const fetchClients = async () => {
        try {
            const data = await window.electronAPI.getClients();
            setClients(data || []);
        } catch (err) {
            console.error('Mükellef listesi alınamadı', err);
        }
    };

    useEffect(() => {
        const handleUpdate = (status: any) => {
            if (status.type === 'progress') {
                setScanProgress(status.progress);
                if (status.progress.insufficientCredits) {
                    setInsufficientCredits(true);
                }
                if (status.progress.completed) {
                    setScanState(null);
                    setInsufficientCredits(false);
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
            setScanning(false);
            setScanProgress(null);
            // Fetch scan state to check if resume is possible
            window.electronAPI.getScanState().then(state => {
                if (state.canResume) setScanState(state);
            }).catch(() => {});
        };

        const handleComplete = async (msg: string) => {
            addLog(msg, 'success');
            setScanning(false);
            setScanProgress(null);
            setScanState(null);
            await fetchTebligatlar();
        };

        window.electronAPI.onScanUpdate(handleUpdate);
        window.electronAPI.onScanError(handleError);
        window.electronAPI.onScanComplete(handleComplete);

        return () => {
            window.electronAPI.removeScanListeners();
        };
    }, []);

    useEffect(() => { fetchTebligatlar(); }, []);
    useEffect(() => { fetchClients(); }, []);

    // Check subscription status
    useEffect(() => {
        window.electronAPI.getSubscriptionStatus().then(setSubscriptionStatus).catch(() => {
            setSubscriptionStatus({ isActive: false, status: 'unknown' });
        });
    }, []);

    // Fetch credits and listen for updates
    useEffect(() => {
        window.electronAPI.getCredits().then(setCreditBalance).catch(() => {});
        window.electronAPI.onCreditsUpdated((credits) => {
            setCreditBalance(credits);
        });
        return () => {
            window.electronAPI.removeCreditsListeners();
        };
    }, []);

    // Load schedule config
    useEffect(() => {
        const loadSchedule = async () => {
            try {
                const status = await window.electronAPI.getScheduleStatus();
                setScheduleConfig(status);
            } catch (err) {
                console.error('Zamanlama durumu alınamadı', err);
            }
        };
        loadSchedule();
    }, []);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => { scrollToBottom(); }, [logs]);

    const addLog = (message: string, type: 'info' | 'error' | 'success' | 'process' = 'info') => {
        setLogs(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
    };

    const handleStartScan = async () => {
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

        // Kredi kontrolü
        try {
            const credits = await window.electronAPI.getCredits();
            setCreditBalance(credits);
            const activeClients = clients.filter(c => c.status === 'active').length;
            if (credits.totalRemaining < activeClients) {
                addLog(`Dikkat: ${credits.totalRemaining} krediniz kaldı, ${activeClients} aktif mükellef var. Kredi bitince tarama duracaktır.`, 'info');
            }
        } catch {}

        setScanning(true);
        setLogs([]);
        setScanProgress(null);
        setScanState(null);
        setInsufficientCredits(false);
        setTebligatlar([]); // Listeyi sıfırla
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
    };

    const handleScheduleToggle = async () => {
        setScheduleLoading(true);
        try {
            const newEnabled = !scheduleConfig.enabled;
            await window.electronAPI.setSchedule({
                enabled: newEnabled,
                finishByTime: scheduleConfig.finishByTime || scheduleConfig.time,
                frequency: scheduleConfig.frequency,
                customDays: scheduleConfig.customDays
            });
            const updated = await window.electronAPI.getScheduleStatus();
            setScheduleConfig(updated);
        } catch (err) {
            console.error('Zamanlama ayarlanamadı', err);
        } finally {
            setScheduleLoading(false);
        }
    };

    const handleScheduleTimeChange = async (newTime: string) => {
        setScheduleConfig(prev => ({ ...prev, time: newTime, finishByTime: newTime }));
        if (scheduleConfig.enabled) {
            try {
                await window.electronAPI.setSchedule({
                    enabled: true,
                    finishByTime: newTime,
                    frequency: scheduleConfig.frequency,
                    customDays: scheduleConfig.customDays
                });
                const updated = await window.electronAPI.getScheduleStatus();
                setScheduleConfig(updated);
            } catch (err) {
                console.error('Zamanlama güncellenemedi', err);
            }
        }
    };

    const handleFrequencyChange = async (newFrequency: 'daily' | 'weekdays' | 'weekends' | 'custom') => {
        const newCustomDays = newFrequency === 'custom' && scheduleConfig.customDays.length === 0
            ? [1, 2, 3, 4, 5] // Default to weekdays if switching to custom with no days selected
            : scheduleConfig.customDays;

        setScheduleConfig(prev => ({ ...prev, frequency: newFrequency, customDays: newCustomDays }));

        if (scheduleConfig.enabled) {
            try {
                await window.electronAPI.setSchedule({
                    enabled: true,
                    finishByTime: scheduleConfig.finishByTime || scheduleConfig.time,
                    frequency: newFrequency,
                    customDays: newCustomDays
                });
                const updated = await window.electronAPI.getScheduleStatus();
                setScheduleConfig(updated);
            } catch (err) {
                console.error('Zamanlama güncellenemedi', err);
            }
        }
    };

    const handleCustomDayToggle = async (day: number) => {
        const newDays = scheduleConfig.customDays.includes(day)
            ? scheduleConfig.customDays.filter(d => d !== day)
            : [...scheduleConfig.customDays, day].sort((a, b) => a - b);

        // Don't allow empty selection
        if (newDays.length === 0) return;

        setScheduleConfig(prev => ({ ...prev, customDays: newDays }));

        if (scheduleConfig.enabled && scheduleConfig.frequency === 'custom') {
            try {
                await window.electronAPI.setSchedule({
                    enabled: true,
                    finishByTime: scheduleConfig.finishByTime || scheduleConfig.time,
                    frequency: 'custom',
                    customDays: newDays
                });
                const updated = await window.electronAPI.getScheduleStatus();
                setScheduleConfig(updated);
            } catch (err) {
                console.error('Zamanlama güncellenemedi', err);
            }
        }
    };

    const handleClientChange = (field: string, value: string) => {
        setClientForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSaveClient = async (event: React.FormEvent) => {
        event.preventDefault();
        setClientError(null);

        if (!clientForm.firm_name.trim() || !clientForm.gib_user_code.trim() || !clientForm.gib_password.trim()) {
            if (!editingClientId || clientForm.gib_password.trim()) {
                setClientError('Firma adı, GİB kullanıcı kodu ve şifre zorunludur.');
                return;
            }
        }

        if (!clientForm.firm_name.trim() || !clientForm.gib_user_code.trim()) {
            setClientError('Firma adı ve GİB kullanıcı kodu zorunludur.');
            return;
        }

        setSavingClient(true);
        try {
            const payload = {
                firm_name: clientForm.firm_name.trim(),
                tax_number: clientForm.tax_number.trim(),
                gib_user_code: clientForm.gib_user_code.trim(),
                gib_password: clientForm.gib_password
            };

            if (editingClientId) {
                await window.electronAPI.updateClient(editingClientId, payload);
            } else {
                await window.electronAPI.saveClient(payload);
            }

            setClientForm({ firm_name: '', tax_number: '', gib_user_code: '', gib_password: '' });
            setEditingClientId(null);
            await fetchClients();
        } catch (err: any) {
            setClientError(err.message || 'Mükellef kaydedilemedi.');
        } finally {
            setSavingClient(false);
        }
    };

    const handleEditClient = (client: any) => {
        setEditingClientId(client.id);
        setClientForm({
            firm_name: client.firm_name || '',
            tax_number: client.tax_number || '',
            gib_user_code: client.gib_user_code || '',
            gib_password: ''
        });
        setClientError(null);
    };

    const handleCancelEdit = () => {
        setEditingClientId(null);
        setClientForm({ firm_name: '', tax_number: '', gib_user_code: '', gib_password: '' });
        setClientError(null);
    };

    const handleToggleClientStatus = async (client: any) => {
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        await window.electronAPI.updateClientStatus(client.id, newStatus);
        await fetchClients();
    };

    const handleDeleteClient = async (client: any) => {
        if (!confirm(`${client.firm_name} kaydını silmek istediğinize emin misiniz?`)) {
            return;
        }
        await window.electronAPI.deleteClient(client.id);
        await fetchClients();
    };

    const escapeCsvValue = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const handleOpenDocument = async (documentPath: string) => {
        try {
            const result = await window.electronAPI.openDocument(documentPath);
            if (!result.success) {
                addLog(`Döküman açılamadı: ${result.error}`, 'error');
            }
        } catch (err: any) {
            addLog(`Döküman açılamadı: ${err.message}`, 'error');
        }
    };

    const handleShareDocument = async (documentPath: string) => {
        try {
            const result = await window.electronAPI.shareDocument(documentPath);
            if (!result.success) {
                addLog(`Klasör açılamadı: ${result.error}`, 'error');
            }
        } catch (err: any) {
            addLog(`Klasör açılamadı: ${err.message}`, 'error');
        }
    };

    const handleOpenDocumentsFolder = async () => {
        try {
            const result = await window.electronAPI.openDocumentsFolder();
            if (!result.success) {
                addLog(`Döküman klasörü açılamadı: ${result.error}`, 'error');
            }
        } catch (err: any) {
            addLog(`Döküman klasörü açılamadı: ${err.message}`, 'error');
        }
    };

    // Accordion toggle
    const toggleClientAccordion = (clientId: number) => {
        setExpandedClients(prev => {
            const newSet = new Set(prev);
            if (newSet.has(clientId)) {
                newSet.delete(clientId);
            } else {
                newSet.add(clientId);
            }
            return newSet;
        });
    };

    // Get page for a client
    const getClientPage = (clientId: number) => clientPages[clientId] || 1;

    // Set page for a client
    const setClientPage = (clientId: number, page: number) => {
        setClientPages(prev => ({ ...prev, [clientId]: page }));
    };

    // Format date from document number or raw date
    const formatDisplayDate = (row: any) => {
        // If we have created_at, use it for display
        if (row.created_at) {
            try {
                const date = new Date(row.created_at);
                return date.toLocaleDateString('tr-TR');
            } catch {
                return row.created_at;
            }
        }
        return '-';
    };

    const handleExportCsv = async () => {
        if (filteredTebligatlar.length === 0) return;
        const headers = ['Mükellef', 'Tarih', 'Gönderen', 'Konu', 'Durum', 'Kayıt Tarihi'];
        const rows = filteredTebligatlar.map((row) => [
            escapeCsvValue(row.firm_name),
            escapeCsvValue(row.tebligat_date),
            escapeCsvValue(row.sender),
            escapeCsvValue(row.subject),
            escapeCsvValue(row.status),
            escapeCsvValue(row.created_at)
        ]);

        const csvContent = [headers.map(escapeCsvValue).join(','), ...rows.map((r) => r.join(','))].join('\n');
        const fileName = `tebligatlar_${new Date().toISOString().slice(0, 10)}.csv`;

        try {
            const result = await window.electronAPI.exportCsv(csvContent, fileName);
            if (result.success) {
                addLog(`CSV dosyası kaydedildi: ${result.filePath}`, 'success');
            } else if (!result.canceled) {
                addLog(`CSV kaydedilemedi: ${result.error}`, 'error');
            }
        } catch (err: any) {
            addLog(`CSV kaydedilemedi: ${err.message}`, 'error');
        }
    };

    const handleExportExcel = async () => {
        if (filteredTebligatlar.length === 0) return;

        const dataRows = filteredTebligatlar.map((row) => ({
            'Mükellef': row.firm_name || '',
            'Tarih': row.tebligat_date || '',
            'Gönderen': row.sender || '',
            'Konu': row.subject || '',
            'Durum': row.status || '',
            'Kayıt Tarihi': row.created_at || ''
        }));

        const fileName = `tebligatlar_${new Date().toISOString().slice(0, 10)}.xlsx`;

        try {
            const result = await window.electronAPI.exportExcel(dataRows, 'Tebligatlar', fileName);
            if (result.success) {
                addLog(`Excel dosyası kaydedildi: ${result.filePath}`, 'success');
            } else if (!result.canceled) {
                addLog(`Excel kaydedilemedi: ${result.error}`, 'error');
            }
        } catch (err: any) {
            addLog(`Excel kaydedilemedi: ${err.message}`, 'error');
        }
    };

    const statusOptions = Array.from(new Set(tebligatlar.map((row) => row.status).filter(Boolean)));
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredTebligatlar = tebligatlar.filter((row) => {
        if (filterClientId !== 'all' && String(row.client_id) !== filterClientId) return false;
        if (filterStatus !== 'all' && row.status !== filterStatus) return false;
        if (normalizedSearch) {
            const haystack = `${row.firm_name || ''} ${row.sender || ''} ${row.subject || ''}`.toLowerCase();
            if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
    });

    // Group tebligatlar by client
    const groupedByClient = filteredTebligatlar.reduce((acc, row) => {
        const clientId = row.client_id;
        if (!acc[clientId]) {
            acc[clientId] = {
                client_id: clientId,
                firm_name: row.firm_name,
                tebligatlar: []
            };
        }
        acc[clientId].tebligatlar.push(row);
        return acc;
    }, {} as Record<number, { client_id: number; firm_name: string; tebligatlar: any[] }>);

    const clientGroups = Object.values(groupedByClient).sort((a, b) =>
        (a.firm_name || '').localeCompare(b.firm_name || '', 'tr')
    );

    const resetFilters = () => {
        setFilterClientId('all');
        setFilterStatus('all');
        setSearchTerm('');
    };

    const progressPercent = scanProgress && scanProgress.total > 0
        ? Math.round((scanProgress.current / scanProgress.total) * 100)
        : 0;

    // Show subscription inactive screen
    if (subscriptionStatus && !subscriptionStatus.isActive) {
        return (
            <div className="p-6 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">E-Tebligat Tarama</h1>
                        <p className="text-slate-500 text-sm mt-1">GİB E-Tebligat kutunuzdaki yeni tebligatları otomatik tarar</p>
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-3">Abonelik Gerekli</h2>
                        <p className="text-slate-600 mb-6">
                            Bu özelliği kullanabilmek için aktif bir aboneliğe sahip olmanız gerekmektedir.
                            Abonelik durumunuz: <span className="text-amber-600 font-medium">Pasif</span>
                        </p>
                        <button
                            onClick={() => window.electronAPI.openBillingPortal()}
                            className="inline-flex items-center px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            Abonelik Satın Al
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 h-full flex flex-col">
            {selectedTebligat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Tebligat Detayı</h3>
                            <button
                                type="button"
                                onClick={() => setSelectedTebligat(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                X
                            </button>
                        </div>
                        <div className="space-y-3 text-sm text-gray-700">
                            <div>
                                <p className="text-xs text-gray-500">Mükellef</p>
                                <p className="font-semibold">{selectedTebligat.firm_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Belge No</p>
                                <p>{selectedTebligat.document_no || selectedTebligat.tebligat_date || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Gönderen</p>
                                <p>{selectedTebligat.sender || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Konu</p>
                                <p>{selectedTebligat.subject || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Durum</p>
                                <p>{selectedTebligat.status || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Kayıt Tarihi</p>
                                <p>{selectedTebligat.created_at || '-'}</p>
                            </div>
                            {/* Döküman İşlemleri */}
                            <div className="pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500 mb-2">Döküman</p>
                                {selectedTebligat.document_path ? (
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleOpenDocument(selectedTebligat.document_path)}
                                            className="flex items-center gap-2 px-3 py-2 bg-sky-50 text-sky-700 rounded-lg hover:bg-sky-100 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            Dökümanı Aç
                                        </button>
                                        <button
                                            onClick={() => handleShareDocument(selectedTebligat.document_path)}
                                            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                            Klasörde Göster
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm">Döküman bulunamadı</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <h1 className="text-2xl font-bold mb-6 text-gray-800">GİB E-Tebligat Otomasyonu</h1>

            <div className="bg-white p-6 rounded-lg shadow-md flex-1 flex flex-col">
                {/* Mükellef Yönetimi */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold mb-2">Mükellef Yönetimi</h2>
                    <p className="text-sm text-gray-500 mb-4">Tarama için mükellef bilgilerini kaydedin.</p>

                    <form onSubmit={handleSaveClient} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Firma Adı</label>
                            <input
                                type="text"
                                value={clientForm.firm_name}
                                onChange={(e) => handleClientChange('firm_name', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                placeholder="Örnek Ltd. Şti."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Vergi No</label>
                            <input
                                type="text"
                                value={clientForm.tax_number}
                                onChange={(e) => handleClientChange('tax_number', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                placeholder="Opsiyonel"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">GİB Kullanıcı Kodu</label>
                            <input
                                type="text"
                                value={clientForm.gib_user_code}
                                onChange={(e) => handleClientChange('gib_user_code', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">GİB Şifre</label>
                            <input
                                type="password"
                                value={clientForm.gib_password}
                                onChange={(e) => handleClientChange('gib_password', e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                placeholder={editingClientId ? '(değiştirmek için yazın)' : ''}
                            />
                        </div>
                        <div className="md:col-span-2 flex items-center justify-between">
                            {clientError && <p className="text-sm text-red-500">{clientError}</p>}
                            <button
                                type="submit"
                                disabled={savingClient}
                                className="ml-auto bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {savingClient ? 'Kaydediliyor...' : editingClientId ? 'Mükellef Güncelle' : 'Mükellef Kaydet'}
                            </button>
                            {editingClientId && (
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="ml-3 text-sm text-gray-500 hover:text-gray-700"
                                >
                                    Vazgeç
                                </button>
                            )}
                        </div>
                    </form>

                    <div className="mt-6 overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full text-sm text-left text-gray-700">
                            <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-4 py-2">Firma</th>
                                    <th className="px-4 py-2">Vergi No</th>
                                    <th className="px-4 py-2">GİB Kullanıcı</th>
                                    <th className="px-4 py-2">Durum</th>
                                    <th className="px-4 py-2">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-3 text-gray-500" colSpan={5}>
                                            Henüz mükellef eklenmedi.
                                        </td>
                                    </tr>
                                ) : (
                                    clients.map((client) => (
                                        <tr key={client.id} className="border-t border-gray-200">
                                            <td className="px-4 py-2 whitespace-nowrap">{client.firm_name}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{client.tax_number || '-'}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{client.gib_user_code}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{client.status || 'active'}</td>
                                            <td className="px-4 py-2 whitespace-nowrap space-x-2">
                                                <button type="button" onClick={() => handleEditClient(client)} className="text-xs text-indigo-600 hover:text-indigo-700">Düzenle</button>
                                                <button type="button" onClick={() => handleToggleClientStatus(client)} className="text-xs text-amber-600 hover:text-amber-700">{client.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}</button>
                                                <button type="button" onClick={() => handleDeleteClient(client)} className="text-xs text-red-600 hover:text-red-700">Sil</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Otomatik Tarama Zamanlama - Modern Design */}
                <div className={`mb-8 rounded-xl border overflow-hidden ${scheduleConfig.enabled ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100' : 'bg-gray-50 border-gray-200'}`}>
                    {/* Header */}
                    <div className={`px-6 py-4 flex items-center justify-between ${scheduleConfig.enabled ? 'bg-white/50 border-b border-indigo-100' : ''}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${scheduleConfig.enabled ? 'bg-indigo-100' : 'bg-gray-200'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${scheduleConfig.enabled ? 'text-indigo-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">Zamanlı Tarama</h2>
                                <p className="text-xs text-gray-500">{scheduleConfig.enabled ? 'Belirtilen saatte tarama tamamlanır' : 'Otomatik zamanlı tarama kapalı'}</p>
                            </div>
                        </div>
                        {/* Toggle Switch */}
                        <button
                            onClick={handleScheduleToggle}
                            disabled={scheduleLoading}
                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                scheduleConfig.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                            } ${scheduleLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                                scheduleConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                            }`} />
                        </button>
                    </div>

                    {scheduleConfig.enabled && (
                    <div className="p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column - Time & Frequency */}
                            <div className="space-y-5">
                                {/* Finish By Time */}
                                <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Tarama Bitiş Saati
                                    </label>
                                    <input
                                        type="time"
                                        value={scheduleConfig.finishByTime || scheduleConfig.time}
                                        onChange={(e) => handleScheduleTimeChange(e.target.value)}
                                        className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <p className="mt-2 text-xs text-gray-500">Tarama bu saate kadar tamamlanacak şekilde otomatik başlatılır</p>
                                </div>

                                {/* Frequency Selection */}
                                <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Tekrar Sıklığı
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { value: 'daily', label: 'Her Gün', icon: '📅' },
                                            { value: 'weekdays', label: 'Hafta İçi', icon: '💼' },
                                            { value: 'weekends', label: 'Hafta Sonu', icon: '🌴' },
                                            { value: 'custom', label: 'Özel', icon: '⚙️' }
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => handleFrequencyChange(option.value as any)}
                                                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                                    scheduleConfig.frequency === option.value
                                                        ? 'bg-indigo-600 text-white shadow-md'
                                                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                                }`}
                                            >
                                                <span>{option.icon}</span>
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Days Selection */}
                                {scheduleConfig.frequency === 'custom' && (
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                        <label className="block text-sm font-medium text-gray-700 mb-3">Günler Seçin</label>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { value: 1, label: 'Pzt' },
                                                { value: 2, label: 'Sal' },
                                                { value: 3, label: 'Çar' },
                                                { value: 4, label: 'Per' },
                                                { value: 5, label: 'Cum' },
                                                { value: 6, label: 'Cmt' },
                                                { value: 0, label: 'Paz' }
                                            ].map(day => (
                                                <button
                                                    key={day.value}
                                                    type="button"
                                                    onClick={() => handleCustomDayToggle(day.value)}
                                                    className={`w-12 h-10 rounded-lg text-sm font-semibold transition-all ${
                                                        scheduleConfig.customDays.includes(day.value)
                                                            ? 'bg-indigo-600 text-white shadow-md'
                                                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                                                    }`}
                                                >
                                                    {day.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Column - Status & Info */}
                            <div className="space-y-4">
                                {/* Schedule Status Card */}
                                <div className={`rounded-lg p-5 ${scheduleConfig.enabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className={`w-3 h-3 rounded-full ${scheduleConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                                        <span className={`font-semibold ${scheduleConfig.enabled ? 'text-emerald-700' : 'text-gray-600'}`}>
                                            {scheduleConfig.enabled ? 'Zamanlama Aktif' : 'Zamanlama Kapalı'}
                                        </span>
                                    </div>

                                    {scheduleConfig.enabled && scheduleConfig.clientCount > 0 && (
                                        <div className="space-y-3">
                                            {/* Estimated Duration */}
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-600">Tahmini Süre:</span>
                                                <span className="font-semibold text-gray-800">
                                                    ~{scheduleConfig.estimatedDurationMinutes} dk
                                                </span>
                                            </div>

                                            {/* Client Count */}
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-600">Aktif Mükellef:</span>
                                                <span className="font-semibold text-gray-800">
                                                    {scheduleConfig.clientCount} adet
                                                </span>
                                            </div>

                                            {/* Estimated Start Time */}
                                            {scheduleConfig.estimatedStartTime && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600">Başlama Saati:</span>
                                                    <span className="font-semibold text-indigo-600">
                                                        {new Date(scheduleConfig.estimatedStartTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            )}

                                            <hr className="border-gray-200" />

                                            {/* Next Scan */}
                                            {scheduleConfig.nextScheduledScanAt && (
                                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                                    <p className="text-xs text-gray-500 mb-1">Sonraki Tarama (Bitiş)</p>
                                                    <p className="font-semibold text-gray-800">
                                                        {new Date(scheduleConfig.nextScheduledScanAt).toLocaleString('tr-TR', {
                                                            weekday: 'long',
                                                            day: 'numeric',
                                                            month: 'long',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {scheduleConfig.enabled && scheduleConfig.clientCount === 0 && (
                                        <div className="flex items-center gap-2 text-amber-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span className="text-sm">Aktif mükellef bulunamadı</span>
                                        </div>
                                    )}

                                    {!scheduleConfig.enabled && (
                                        <p className="text-sm text-gray-500">
                                            Zamanlamayı aktif ederek taramanın belirttiğiniz saatte tamamlanmasını sağlayabilirsiniz.
                                        </p>
                                    )}
                                </div>

                                {/* Last Scan Info */}
                                {scheduleConfig.lastScheduledScanAt && (
                                    <div className="bg-white rounded-lg p-4 border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">Son Zamanlı Tarama</p>
                                        <p className="text-sm font-medium text-gray-700">
                                            {new Date(scheduleConfig.lastScheduledScanAt).toLocaleString('tr-TR')}
                                        </p>
                                    </div>
                                )}

                                {/* How it works info */}
                                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                    <div className="flex items-start gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div className="text-xs text-blue-700">
                                            <p className="font-semibold mb-1">Nasıl Çalışır?</p>
                                            <p>Sistem, mükellef sayısı ve tarama ayarlarınıza göre tahmini süreyi hesaplar ve tarama otomatik olarak belirlediğiniz saatte tamamlanacak şekilde erken başlatılır.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>

                {/* İşlem Logları */}
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-lg font-semibold">İşlem Logları</h2>
                        <p className="text-sm text-gray-500">Otomatik sorgulama durumunu buradan takip edebilirsiniz.</p>
                    </div>

                    <div className="flex space-x-3">
                        <button
                            onClick={handleStartScan}
                            disabled={scanning}
                            className={`flex items-center px-6 py-3 rounded-lg font-bold text-white shadow-md transition-all ${scanning
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg'
                                }`}
                        >
                            {scanning ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Taranıyor...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Taramayı Başlat
                                </>
                            )}
                        </button>
                        {scanning && (
                            <button
                                onClick={handleStopScan}
                                className="flex items-center px-4 py-3 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-md transition-all"
                            >
                                Durdur
                            </button>
                        )}
                    </div>
                </div>

                {/* Resume / Restart Panel */}
                {!scanning && scanState && scanState.canResume && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-amber-800">
                                    Tarama {insufficientCredits ? 'kredi yetersizliğinden durdu' : scanState.wasCancelled ? 'durduruldu' : 'tamamlanamadı'}: {scanState.processedCount}/{scanState.total} mükellef tarandı.
                                </p>
                                <p className="text-xs text-amber-600 mt-1">
                                    {scanState.successes} başarılı, {scanState.errors} hatalı — {scanState.total - scanState.processedCount} mükellef kaldı.
                                </p>
                            </div>
                            <div className="flex space-x-3">
                                {insufficientCredits && (
                                    <button
                                        onClick={() => window.electronAPI.purchaseCredits()}
                                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all"
                                    >
                                        Kredi Satın Al
                                    </button>
                                )}
                                <button
                                    onClick={handleResumeScan}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                                >
                                    Devam Et
                                </button>
                                <button
                                    onClick={handleStartScan}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all"
                                >
                                    Baştan Başlat
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Progress Bar */}
                {scanning && scanProgress && (
                    <div className="mb-4 p-3 bg-gray-100 rounded-lg">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>
                                {scanProgress.currentClient
                                    ? `İşlem: ${scanProgress.currentClient}`
                                    : 'Bekleniyor...'}
                            </span>
                            <span>{scanProgress.current}/{scanProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-300 rounded-full h-2.5">
                            <div
                                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{scanProgress.successes} başarılı, {scanProgress.errors} hata</span>
                            <span>%{progressPercent}</span>
                        </div>
                    </div>
                )}

                <div className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-y-auto min-h-[400px]">
                    {logs.length === 0 ? (
                        <div className="text-gray-500 text-center mt-10">Henüz işlem yapılmadı. Başlamak için butona tıklayın.</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="mb-1 border-l-2 pl-2" style={{
                                borderColor: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : log.type === 'process' ? '#fbbf24' : '#60a5fa'
                            }}>
                                <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                                <span className={
                                    log.type === 'error' ? 'text-red-400' :
                                        log.type === 'success' ? 'text-green-400' :
                                            log.type === 'process' ? 'text-yellow-400' :
                                                'text-blue-400'
                                }>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>

                {/* Son Tebligatlar */}
                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold">Son Tebligatlar</h2>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={handleOpenDocumentsFolder}
                                className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                                title="Döküman klasörünü aç"
                            >
                                Döküman Klasörü
                            </button>
                            <button
                                onClick={handleExportExcel}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-emerald-300"
                                disabled={filteredTebligatlar.length === 0}
                            >
                                Excel'e Aktar
                            </button>
                            <button
                                onClick={handleExportCsv}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-emerald-300"
                                disabled={filteredTebligatlar.length === 0}
                            >
                                CSV'ye Aktar
                            </button>
                            <button
                                onClick={fetchTebligatlar}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                                Yenile
                            </button>
                        </div>
                    </div>

                    {loadingTebligatlar ? (
                        <div className="text-sm text-gray-500">Tebligatlar yükleniyor...</div>
                    ) : tebligatlar.length === 0 ? (
                        <div className="text-sm text-gray-500">Kayıtlı tebligat bulunamadı.</div>
                    ) : (
                        <>
                            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Mükellef</label>
                                    <select
                                        value={filterClientId}
                                        onChange={(e) => setFilterClientId(e.target.value)}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                    >
                                        <option value="all">Tümü</option>
                                        {clients.map((client) => (
                                            <option key={client.id} value={String(client.id)}>
                                                {client.firm_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Durum</label>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                    >
                                        <option value="all">Tümü</option>
                                        {statusOptions.map((status) => (
                                            <option key={status} value={status}>
                                                {status}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Arama</label>
                                    <input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                        placeholder="Gönderen, konu, mükellef"
                                    />
                                </div>
                                <div className="md:pt-6">
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                                    >
                                        Filtreleri Temizle
                                    </button>
                                </div>
                            </div>
                            {filteredTebligatlar.length === 0 ? (
                                <div className="text-sm text-gray-500">Filtre sonucu kayıt bulunamadı.</div>
                            ) : (
                                <div className="space-y-3">
                                    {clientGroups.map((group) => {
                                        const isExpanded = expandedClients.has(group.client_id);
                                        const currentPage = getClientPage(group.client_id);
                                        const totalPages = Math.ceil(group.tebligatlar.length / ITEMS_PER_PAGE);
                                        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                                        const paginatedItems = group.tebligatlar.slice(startIndex, startIndex + ITEMS_PER_PAGE);

                                        return (
                                            <div key={group.client_id} className="border border-gray-200 rounded-lg overflow-hidden">
                                                {/* Accordion Header */}
                                                <button
                                                    onClick={() => toggleClientAccordion(group.client_id)}
                                                    className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                                                        isExpanded ? 'bg-indigo-50' : 'bg-gray-50 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                        <span className="font-semibold text-gray-800">{group.firm_name || 'Bilinmeyen'}</span>
                                                    </div>
                                                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                                                        group.tebligatlar.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {group.tebligatlar.length} tebligat
                                                    </span>
                                                </button>

                                                {/* Accordion Content */}
                                                {isExpanded && (
                                                    <div className="bg-white">
                                                        <div className="overflow-x-auto">
                                                            <table className="min-w-full text-sm text-left text-gray-700">
                                                                <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                                                                    <tr>
                                                                        <th className="px-4 py-2">Kayıt Tarihi</th>
                                                                        <th className="px-4 py-2">Belge No</th>
                                                                        <th className="px-4 py-2">Gönderen</th>
                                                                        <th className="px-4 py-2">Konu</th>
                                                                        <th className="px-4 py-2">Durum</th>
                                                                        <th className="px-4 py-2">Döküman</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginatedItems.map((row) => (
                                                                        <tr
                                                                            key={row.id}
                                                                            className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                                                                            onClick={() => setSelectedTebligat(row)}
                                                                        >
                                                                            <td className="px-4 py-2 whitespace-nowrap">{formatDisplayDate(row)}</td>
                                                                            <td className="px-4 py-2 whitespace-nowrap text-xs font-mono">{row.document_no || row.tebligat_date || '-'}</td>
                                                                            <td className="px-4 py-2 whitespace-nowrap">{row.sender || '-'}</td>
                                                                            <td className="px-4 py-2 max-w-xs truncate">{row.subject || '-'}</td>
                                                                            <td className="px-4 py-2 whitespace-nowrap">
                                                                                <span className={`px-2 py-1 text-xs rounded-full ${
                                                                                    row.status === 'Tebligat yok' ? 'bg-gray-100 text-gray-600' :
                                                                                    row.status?.toLowerCase().includes('okundu') ? 'bg-green-100 text-green-700' :
                                                                                    'bg-amber-100 text-amber-700'
                                                                                }`}>
                                                                                    {row.status || '-'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                                                {row.document_path ? (
                                                                                    <div className="flex gap-2">
                                                                                        <button
                                                                                            onClick={() => handleOpenDocument(row.document_path)}
                                                                                            className="text-sky-600 hover:text-sky-700"
                                                                                            title="Dökümanı Aç"
                                                                                        >
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                            </svg>
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleShareDocument(row.document_path)}
                                                                                            className="text-emerald-600 hover:text-emerald-700"
                                                                                            title="Klasörde Göster"
                                                                                        >
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                                                            </svg>
                                                                                        </button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="text-gray-400 text-xs">-</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Pagination */}
                                                        {totalPages > 1 && (
                                                            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                                                                <span className="text-xs text-gray-500">
                                                                    {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, group.tebligatlar.length)} / {group.tebligatlar.length}
                                                                </span>
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setClientPage(group.client_id, Math.max(1, currentPage - 1));
                                                                        }}
                                                                        disabled={currentPage === 1}
                                                                        className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                                                    >
                                                                        Önceki
                                                                    </button>
                                                                    <span className="px-3 py-1 text-xs">
                                                                        {currentPage} / {totalPages}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setClientPage(group.client_id, Math.min(totalPages, currentPage + 1));
                                                                        }}
                                                                        disabled={currentPage === totalPages}
                                                                        className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                                                    >
                                                                        Sonraki
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ETebligat;
