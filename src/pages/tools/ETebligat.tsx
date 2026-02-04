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
        // Setup IPC listeners
        const handleUpdate = (status: any) => {
            addLog(status.message, status.type);
        };

        const handleError = (errorMsg: string) => {
            addLog(errorMsg, 'error');
            setScanning(false);
        };

        const handleComplete = async (msg: string) => {
            addLog(msg, 'success');
            setScanning(false);
            await fetchTebligatlar();
        };

        window.electronAPI.onScanUpdate(handleUpdate);
        window.electronAPI.onScanError(handleError);
        window.electronAPI.onScanComplete(handleComplete);

        return () => {
            window.electronAPI.removeScanListeners();
        };
    }, []);

    useEffect(() => {
        fetchTebligatlar();
    }, []);

    useEffect(() => {
        fetchClients();
    }, []);

    const scrollToBottom = () => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [logs]);

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

        setScanning(true);
        setLogs([]);
        addLog('Tarama başlatılıyor...', 'info');
        window.electronAPI.startScan();
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

    const handleExportCsv = () => {
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
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'tebligatlar.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

    const resetFilters = () => {
        setFilterClientId('all');
        setFilterStatus('all');
        setSearchTerm('');
    };

    return (
        <div className="p-6 h-full flex flex-col">
            {selectedTebligat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">Tebligat Detayı</h3>
                            <button
                                type="button"
                                onClick={() => setSelectedTebligat(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-3 text-sm text-gray-700">
                            <div>
                                <p className="text-xs text-gray-500">Mükellef</p>
                                <p className="font-semibold">{selectedTebligat.firm_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Tarih</p>
                                <p>{selectedTebligat.tebligat_date || '-'}</p>
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
                        </div>
                    </div>
                </div>
            )}
            <h1 className="text-2xl font-bold mb-6 text-gray-800">GİB E-Tebligat Otomasyonu</h1>

            <div className="bg-white p-6 rounded-lg shadow-md flex-1 flex flex-col">
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
                                placeholder={editingClientId ? '•••••• (değiştirmek için yazın)' : ''}
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
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditClient(client)}
                                                    className="text-xs text-indigo-600 hover:text-indigo-700"
                                                >
                                                    Düzenle
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleClientStatus(client)}
                                                    className="text-xs text-amber-600 hover:text-amber-700"
                                                >
                                                    {client.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteClient(client)}
                                                    className="text-xs text-red-600 hover:text-red-700"
                                                >
                                                    Sil
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-lg font-semibold">İşlem Logları</h2>
                        <p className="text-sm text-gray-500">Otomatik sorgulama durumunu buradan takip edebilirsiniz.</p>
                    </div>

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
                </div>

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

                <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold">Son Tebligatlar</h2>
                        <div className="flex items-center space-x-3">
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
                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full text-sm text-left text-gray-700">
                                        <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                                            <tr>
                                                <th className="px-4 py-2">Mükellef</th>
                                                <th className="px-4 py-2">Tarih</th>
                                                <th className="px-4 py-2">Gönderen</th>
                                                <th className="px-4 py-2">Konu</th>
                                                <th className="px-4 py-2">Durum</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTebligatlar.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                                                    onClick={() => setSelectedTebligat(row)}
                                                >
                                                    <td className="px-4 py-2 whitespace-nowrap">{row.firm_name || '-'}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{row.tebligat_date || '-'}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{row.sender || '-'}</td>
                                                    <td className="px-4 py-2">{row.subject || '-'}</td>
                                                    <td className="px-4 py-2 whitespace-nowrap">{row.status || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
