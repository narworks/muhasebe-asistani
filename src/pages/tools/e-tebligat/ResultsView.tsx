import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Tebligat, Client } from '../../../types';
import type { ClientGroup } from './types';

type SortBy = 'date' | 'sender' | 'status';

type DateRangePreset =
    | 'all'
    | 'today'
    | 'yesterday'
    | 'last3'
    | 'last7'
    | 'last30'
    | 'thisYear'
    | 'custom';

interface ResultsViewProps {
    // Data
    tebligatlar: Tebligat[];
    filteredTebligatlar: Tebligat[];
    clientGroups: ClientGroup[];
    clients: Client[];
    allNewTebligatIds: Set<number>;
    loadingTebligatlar: boolean;
    // Filter state
    filterDateRange: DateRangePreset;
    filterDateFrom: string;
    filterDateTo: string;
    filterClientId: string;
    filterStatus: string;
    filterSender: string;
    searchTerm: string;
    // Filter setters
    onFilterDateRange: (value: DateRangePreset) => void;
    onFilterDateFrom: (value: string) => void;
    onFilterDateTo: (value: string) => void;
    onFilterClientId: (value: string) => void;
    onFilterStatus: (value: string) => void;
    onFilterSender: (value: string) => void;
    onSearchTerm: (value: string) => void;
    // Filter options
    statusOptions: string[];
    uniqueSenders: string[];
    // Accordion
    expandedClients: Set<number>;
    expandedScans: Set<string>;
    onToggleClient: (id: number) => void;
    onToggleScan: (key: string) => void;
    // Actions
    onSelectTebligat: (t: Tebligat) => void;
    onFetchDocument: (id: number) => void;
    onOpenDocument: (path: string, tebligatId?: number) => void;
    onShareDocument: (path: string) => void;
    fetchingDocumentId: number | null;
    // Documents folder
    documentsFolder: string | null;
    onOpenDocumentsFolder: () => void;
    onSelectDocumentsFolder: () => void;
    // Export
    onExportCsv: () => void;
    onExportExcel: () => void;
    // Refresh & reset
    onRefresh: () => void;
    onResetFilters: () => void;
}

// Determine per-item viewed/pending status. Returns 'new' (today, unviewed),
// 'pending' (older, unviewed), or null (already viewed by muhasebeci).
const getViewBadge = (t: Tebligat, startOfTodayMs: number): 'new' | 'pending' | null => {
    if (t.app_viewed_at) return null;
    const ref = t.notification_date || t.send_date || t.created_at;
    if (!ref) return 'pending';
    const ts = new Date(ref).getTime();
    if (Number.isNaN(ts)) return 'pending';
    return ts >= startOfTodayMs ? 'new' : 'pending';
};

const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

const getStatusBadgeClass = (status?: string): string => {
    const base = 'text-sm font-medium px-3 py-1 rounded-full border';
    if (!status) return `${base} bg-gray-100 text-gray-500 border-gray-200`;
    const s = status.toLowerCase();
    if (s.includes('okunmu') && !s.includes('okunmam')) {
        return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    }
    if (s.includes('okunmam')) {
        return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    }
    if (s.includes('arsivlen') || s.includes('ar\u015Fivlen')) {
        return `${base} bg-gray-100 text-gray-500 border-gray-200`;
    }
    return `${base} bg-gray-100 text-gray-600 border-gray-200`;
};

const ResultsView: React.FC<ResultsViewProps> = ({
    tebligatlar,
    filteredTebligatlar,
    clientGroups,
    clients,
    allNewTebligatIds,
    loadingTebligatlar,
    filterDateRange,
    filterDateFrom,
    filterDateTo,
    filterClientId,
    filterStatus,
    filterSender,
    searchTerm,
    onFilterDateRange,
    onFilterDateFrom,
    onFilterDateTo,
    onFilterClientId,
    onFilterStatus,
    onFilterSender,
    onSearchTerm,
    statusOptions,
    uniqueSenders,
    expandedClients,
    expandedScans,
    onToggleClient,
    onToggleScan,
    onSelectTebligat,
    onFetchDocument,
    onOpenDocument,
    onShareDocument,
    fetchingDocumentId,
    documentsFolder,
    onOpenDocumentsFolder,
    onSelectDocumentsFolder,
    onExportCsv,
    onExportExcel,
    onRefresh,
    onResetFilters,
}) => {
    const [sortBy, setSortBy] = useState<SortBy>('date');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    // Computed once per render; used by getViewBadge for per-item "Yeni" vs "Bakılmadı" decision.
    const startOfTodayMs = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }, []);

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setShowExportMenu(false);
            }
        };
        if (showExportMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExportMenu]);

    const toggleGroup = useCallback((key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    // Build a client_id -> firm_name lookup from clients list
    const clientNameMap = useMemo(() => {
        const map = new Map<number, string>();
        for (const c of clients) {
            map.set(c.id, c.firm_name);
        }
        return map;
    }, [clients]);

    const sortedTebligatlar = useMemo(() => {
        const items = [...filteredTebligatlar];
        switch (sortBy) {
            case 'date':
                items.sort((a, b) => {
                    const da = a.notification_date || a.send_date || a.created_at || '';
                    const db = b.notification_date || b.send_date || b.created_at || '';
                    return db.localeCompare(da);
                });
                break;
            case 'sender':
                items.sort((a, b) => (a.sender || '').localeCompare(b.sender || '', 'tr'));
                break;
            case 'status':
                items.sort((a, b) => (a.status || '').localeCompare(b.status || '', 'tr'));
                break;
        }
        return items;
    }, [filteredTebligatlar, sortBy]);

    // Grouped data for client grouping mode — always group when multiple clients
    const groupedByClient = useMemo(() => {
        const groups = new Map<string, Tebligat[]>();
        for (const t of sortedTebligatlar) {
            const name = t.firm_name || clientNameMap.get(t.client_id) || 'Bilinmeyen';
            if (!groups.has(name)) {
                groups.set(name, []);
            }
            groups.get(name)!.push(t);
        }
        // Sort groups by name
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
    }, [sortedTebligatlar, clientNameMap]);

    // Auto-determine: if only one client, show flat list
    const useGrouping = groupedByClient.length > 1;

    const renderCard = (t: Tebligat, showClient: boolean) => {
        const clientName = t.firm_name || clientNameMap.get(t.client_id) || 'Bilinmeyen';
        const isNew = allNewTebligatIds.has(t.id);
        const badge = getViewBadge(t, startOfTodayMs);
        // Border accent: green for "Yeni", amber for "Bakılmadı", subtle for viewed
        const borderClass =
            badge === 'new'
                ? 'border-l-4 border-l-emerald-400 bg-emerald-50/40'
                : badge === 'pending'
                  ? 'border-l-4 border-l-amber-400 bg-amber-50/30'
                  : isNew
                    ? 'border-l-4 border-l-emerald-400 bg-emerald-50/30'
                    : 'hover:bg-gray-50/50';

        return (
            <div
                key={t.id}
                id={`tebligat-row-${t.id}`}
                className={`border border-gray-200 rounded-lg p-3 hover:border-indigo-300 hover:shadow-md transition-all cursor-default scroll-mt-4 ${borderClass}`}
            >
                <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {badge === 'new' && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-200/70 px-1.5 py-0.5 rounded">
                                    Yeni
                                </span>
                            )}
                            {badge === 'pending' && (
                                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-200/70 px-1.5 py-0.5 rounded">
                                    Bakılmadı
                                </span>
                            )}
                            <p className="font-medium text-sm text-gray-800 truncate">
                                {t.subject || 'Tebligat'}
                            </p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {t.sender || '-'}
                            {showClient && <> &middot; {clientName}</>} &middot;{' '}
                            {formatDate(t.notification_date || t.send_date)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={getStatusBadgeClass(t.status)}>{t.status || '-'}</span>
                        {t.document_path ? (
                            <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                                &#304;ndirildi
                            </span>
                        ) : (
                            <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                İndirilmedi
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                    {t.document_path ? (
                        <>
                            <button
                                onClick={() => onOpenDocument(t.document_path!, t.id)}
                                className="text-sm font-medium px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                            >
                                A&ccedil;
                            </button>
                            <button
                                onClick={() => onShareDocument(t.document_path!)}
                                className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                            >
                                Klas&ouml;rde G&ouml;ster
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onFetchDocument(t.id)}
                            disabled={fetchingDocumentId === t.id}
                            className="text-sm font-medium px-4 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                            {fetchingDocumentId === t.id ? 'İndiriliyor...' : 'İndir'}
                        </button>
                    )}
                    <button
                        onClick={() => onSelectTebligat(t)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors ml-auto"
                    >
                        Detay
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Tebligat Sonu&ccedil;lar&#305;
                    </h2>
                    <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {tebligatlar.length} kay&#305;t
                    </span>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onOpenDocumentsFolder}
                            className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                            title={documentsFolder || 'Varsay\u0131lan klas\u00f6r'}
                        >
                            D&ouml;k&uuml;man Klas&ouml;r&uuml;
                        </button>
                        <button
                            onClick={onSelectDocumentsFolder}
                            className="text-xs text-gray-400 hover:text-gray-600"
                            title="D\u00f6k\u00fcman klas\u00f6r\u00fcn\u00fc de\u011fi\u015ftir"
                        >
                            (De&#287;i&#351;tir)
                        </button>
                    </div>
                    <button
                        onClick={onRefresh}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-indigo-500/30 text-indigo-600 hover:bg-indigo-50"
                    >
                        Yenile
                    </button>
                </div>
            </div>

            {loadingTebligatlar ? (
                <div className="text-sm text-gray-500">Tebligatlar y&uuml;kleniyor...</div>
            ) : tebligatlar.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-12 w-12 mx-auto text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                        />
                    </svg>
                    <p className="mt-2 font-medium">Kay&#305;tl&#305; tebligat bulunamad&#305;</p>
                    <p className="text-xs mt-1">
                        Taramay&#305; ba&#351;latarak yeni tebligatlar&#305; ke&#351;fedin
                    </p>
                </div>
            ) : (
                <>
                    {/* Primary filter row */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex-1">
                            <input
                                value={searchTerm}
                                onChange={(e) => onSearchTerm(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                placeholder="G&ouml;nderen, konu, m&uuml;kellef ara..."
                            />
                        </div>
                        <select
                            value={filterDateRange}
                            onChange={(e) => onFilterDateRange(e.target.value as DateRangePreset)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                        >
                            <option value="all">T&uuml;m Tarihler</option>
                            <option value="today">Bug&uuml;n</option>
                            <option value="yesterday">D&uuml;n</option>
                            <option value="last3">Son 3 G&uuml;n</option>
                            <option value="last7">Son 7 G&uuml;n</option>
                            <option value="last30">Son 30 G&uuml;n</option>
                            <option value="thisYear">Bu Y&#305;l</option>
                            <option value="custom">&Ouml;zel Aral&#305;k</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap px-2 py-2"
                        >
                            Filtreler {showAdvancedFilters ? '\u25B2' : '\u25BC'}
                        </button>
                        <div className="relative" ref={exportMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                disabled={filteredTebligatlar.length === 0}
                                className="text-xs font-semibold px-2.5 py-2 rounded border border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 whitespace-nowrap"
                            >
                                D&#305;&#351;a Aktar &#9662;
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onExportExcel();
                                            setShowExportMenu(false);
                                        }}
                                        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        Excel&apos;e Aktar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onExportCsv();
                                            setShowExportMenu(false);
                                        }}
                                        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        CSV&apos;ye Aktar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Custom date inputs (inline when custom selected) */}
                    {filterDateRange === 'custom' && (
                        <div className="flex gap-2 mb-3">
                            <input
                                type="date"
                                value={filterDateFrom}
                                onChange={(e) => onFilterDateFrom(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            />
                            <input
                                type="date"
                                value={filterDateTo}
                                onChange={(e) => onFilterDateTo(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            />
                        </div>
                    )}

                    {/* Advanced filters (collapsed by default) */}
                    {showAdvancedFilters && (
                        <div className="flex gap-3 mb-3">
                            <div className="flex-1">
                                <select
                                    value={filterClientId}
                                    onChange={(e) => onFilterClientId(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                >
                                    <option value="all">T&uuml;m M&uuml;kellefler</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={String(client.id)}>
                                            {client.firm_name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <select
                                    value={filterSender}
                                    onChange={(e) => onFilterSender(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                >
                                    <option value="all">T&uuml;m G&ouml;nderenler</option>
                                    {uniqueSenders.map((sender) => (
                                        <option key={sender} value={sender}>
                                            {sender.length > 50
                                                ? sender.substring(0, 50) + '...'
                                                : sender}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => onFilterStatus(e.target.value)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                >
                                    <option value="all">T&uuml;m Durumlar</option>
                                    {statusOptions.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                >
                                    <option value="date">Tarihe G&ouml;re</option>
                                    <option value="sender">G&ouml;nderene G&ouml;re</option>
                                    <option value="status">Duruma G&ouml;re</option>
                                </select>
                            </div>
                            <div className="flex items-center">
                                <button
                                    type="button"
                                    onClick={onResetFilters}
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 whitespace-nowrap"
                                >
                                    Temizle
                                </button>
                            </div>
                        </div>
                    )}

                    {sortedTebligatlar.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-12 w-12 mx-auto text-gray-300"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                            <p className="mt-2 font-medium">
                                Kay&#305;tl&#305; tebligat bulunamad&#305;
                            </p>
                            <p className="text-xs mt-1">
                                Taramay&#305; ba&#351;latarak yeni tebligatlar&#305; ke&#351;fedin
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="text-xs text-gray-400 mb-2">
                                {sortedTebligatlar.length} sonu&ccedil;
                                g&ouml;r&uuml;nt&uuml;leniyor
                            </div>

                            {clientGroups.length > 0 ? (
                                /* Grouped by client → scan date → cards */
                                clientGroups.map((cg) => {
                                    const isClientExpanded = expandedClients.has(cg.client_id);
                                    return (
                                        <div
                                            key={cg.client_id}
                                            id={`client-accordion-${cg.client_id}`}
                                            className="mb-2 border border-gray-200 rounded-lg overflow-hidden scroll-mt-4"
                                        >
                                            {/* Client header */}
                                            <button
                                                type="button"
                                                onClick={() => onToggleClient(cg.client_id)}
                                                className="flex items-center gap-2 w-full text-left py-2.5 px-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                            >
                                                {isClientExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                                                )}
                                                <span className="text-sm font-semibold text-gray-700 truncate">
                                                    {cg.firm_name}
                                                </span>
                                                <span className="text-xs font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full shrink-0">
                                                    {cg.tebligatlar.length} tebligat
                                                </span>
                                            </button>

                                            {/* Scan date sub-groups */}
                                            {isClientExpanded && (
                                                <div className="px-3 pb-2">
                                                    {cg.scanGroups.map((sg) => {
                                                        const scanKey = `${cg.client_id}-${sg.scanDate}`;
                                                        const isScanExpanded =
                                                            expandedScans.has(scanKey);
                                                        return (
                                                            <div key={scanKey} className="mt-2">
                                                                {/* Scan date header */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        onToggleScan(scanKey)
                                                                    }
                                                                    className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-gray-50 transition-colors"
                                                                >
                                                                    {isScanExpanded ? (
                                                                        <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                                                    ) : (
                                                                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                                                                    )}
                                                                    <span className="text-xs font-medium text-gray-500">
                                                                        {sg.scanLabel}
                                                                    </span>
                                                                    <span className="text-xs text-gray-400">
                                                                        ({sg.tebligatlar.length})
                                                                    </span>
                                                                </button>

                                                                {/* Tebligat cards */}
                                                                {isScanExpanded && (
                                                                    <div className="space-y-2 mt-1.5 ml-5">
                                                                        {sg.tebligatlar.map((t) =>
                                                                            renderCard(t, false)
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                /* Flat list fallback */
                                <div className="space-y-2">
                                    {sortedTebligatlar.map((t) => renderCard(t, true))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ResultsView;
