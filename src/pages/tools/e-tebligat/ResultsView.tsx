import React from 'react';
import type { Tebligat, Client } from '../../../types';
import type { ClientGroup } from './types';

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
    onOpenDocument: (path: string) => void;
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
                            title={documentsFolder || 'Varsayılan klasör'}
                        >
                            Döküman Klasörü
                        </button>
                        <button
                            onClick={onSelectDocumentsFolder}
                            className="text-xs text-gray-400 hover:text-gray-600"
                            title="Döküman klasörünü değiştir"
                        >
                            (Değiştir)
                        </button>
                    </div>
                    <button
                        onClick={onExportExcel}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        disabled={filteredTebligatlar.length === 0}
                    >
                        Excel&apos;e Aktar
                    </button>
                    <button
                        onClick={onExportCsv}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        disabled={filteredTebligatlar.length === 0}
                    >
                        CSV&apos;ye Aktar
                    </button>
                    <button
                        onClick={onRefresh}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-indigo-500/30 text-indigo-600 hover:bg-indigo-50"
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
                    {/* Date range preset buttons */}
                    <div className="mb-3">
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Tarih Aral&#305;&#287;&#305;
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    ['all', 'T\u00fcm\u00fc'],
                                    ['today', 'Bug\u00fcn'],
                                    ['yesterday', 'D\u00fcn'],
                                    ['last3', 'Son 3 G\u00fcn'],
                                    ['last7', 'Son 7 G\u00fcn'],
                                    ['last30', 'Son 30 G\u00fcn'],
                                    ['thisYear', 'Bu Y\u0131l'],
                                    ['custom', '\u00d6zel'],
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => onFilterDateRange(key as DateRangePreset)}
                                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                                        filterDateRange === key
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {filterDateRange === 'custom' && (
                            <div className="flex gap-2 mt-2">
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
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                                M&uuml;kellef
                            </label>
                            <select
                                value={filterClientId}
                                onChange={(e) => onFilterClientId(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            >
                                <option value="all">T&uuml;m&uuml;</option>
                                {clients.map((client) => (
                                    <option key={client.id} value={String(client.id)}>
                                        {client.firm_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                                G&ouml;nderen (Kurum)
                            </label>
                            <select
                                value={filterSender}
                                onChange={(e) => onFilterSender(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            >
                                <option value="all">T&uuml;m&uuml;</option>
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
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                                Durum
                            </label>
                            <select
                                value={filterStatus}
                                onChange={(e) => onFilterStatus(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                            >
                                <option value="all">T&uuml;m&uuml;</option>
                                {statusOptions.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                                Arama
                            </label>
                            <input
                                value={searchTerm}
                                onChange={(e) => onSearchTerm(e.target.value)}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                                placeholder="G&ouml;nderen, konu, m&uuml;kellef"
                            />
                        </div>
                        <div className="md:pt-6">
                            <button
                                type="button"
                                onClick={onResetFilters}
                                className="text-xs font-semibold text-gray-500 hover:text-gray-700 whitespace-nowrap"
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

                                return (
                                    <div
                                        key={group.client_id}
                                        className="border border-gray-200 rounded-lg overflow-hidden"
                                    >
                                        {/* Accordion Header */}
                                        <button
                                            onClick={() => onToggleClient(group.client_id)}
                                            className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                                                isExpanded
                                                    ? 'bg-indigo-50'
                                                    : 'bg-gray-50 hover:bg-gray-100'
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
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 5l7 7-7 7"
                                                    />
                                                </svg>
                                                <span className="font-semibold text-gray-800">
                                                    {group.firm_name || 'Bilinmeyen'}
                                                </span>
                                            </div>
                                            <span
                                                className={`text-sm font-medium px-2 py-1 rounded-full ${
                                                    group.tebligatlar.length > 0
                                                        ? 'bg-indigo-100 text-indigo-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {group.tebligatlar.length} tebligat
                                            </span>
                                        </button>

                                        {/* Accordion Content — Scan Date Sub-Accordions */}
                                        {isExpanded && (
                                            <div className="bg-white divide-y divide-gray-100">
                                                {group.scanGroups.map((scan, scanIdx) => {
                                                    const scanKey = `${group.client_id}-${scanIdx}`;
                                                    const isScanExpanded =
                                                        expandedScans.has(scanKey);
                                                    const newInScan = scan.tebligatlar.filter((t) =>
                                                        allNewTebligatIds.has(t.id)
                                                    ).length;
                                                    const oldInScan =
                                                        scan.tebligatlar.length - newInScan;
                                                    return (
                                                        <div key={scanKey}>
                                                            <button
                                                                onClick={() =>
                                                                    onToggleScan(scanKey)
                                                                }
                                                                className={`w-full px-5 py-2.5 flex items-center justify-between text-left ${isScanExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <svg
                                                                        xmlns="http://www.w3.org/2000/svg"
                                                                        className={`h-3 w-3 text-gray-400 transition-transform ${isScanExpanded ? 'rotate-90' : ''}`}
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={2}
                                                                            d="M9 5l7 7-7 7"
                                                                        />
                                                                    </svg>
                                                                    <span className="text-sm text-gray-700">
                                                                        Tarama: {scan.scanLabel}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {newInScan > 0 && (
                                                                        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                                                            {newInScan} adet
                                                                            &middot; yeni
                                                                        </span>
                                                                    )}
                                                                    {newInScan > 0 &&
                                                                        oldInScan > 0 && (
                                                                            <span className="text-xs text-gray-300">
                                                                                &middot;
                                                                            </span>
                                                                        )}
                                                                    {oldInScan > 0 && (
                                                                        <span className="text-xs text-gray-500">
                                                                            {oldInScan} adet
                                                                        </span>
                                                                    )}
                                                                    {newInScan === 0 &&
                                                                        oldInScan === 0 && (
                                                                            <span className="text-xs text-gray-400">
                                                                                {
                                                                                    scan.tebligatlar
                                                                                        .length
                                                                                }{' '}
                                                                                tebligat
                                                                            </span>
                                                                        )}
                                                                </div>
                                                            </button>
                                                            {isScanExpanded && (
                                                                <div className="overflow-x-auto">
                                                                    <table className="min-w-full text-sm text-left text-gray-700">
                                                                        <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2">
                                                                                    Belge No
                                                                                </th>
                                                                                <th className="px-4 py-2">
                                                                                    G&ouml;nderen
                                                                                </th>
                                                                                <th className="px-4 py-2">
                                                                                    Konu
                                                                                </th>
                                                                                <th className="px-4 py-2">
                                                                                    Durum
                                                                                </th>
                                                                                <th className="px-4 py-2">
                                                                                    D&ouml;k&uuml;man
                                                                                </th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {scan.tebligatlar.map(
                                                                                (row) => (
                                                                                    <tr
                                                                                        key={row.id}
                                                                                        className={`border-t border-gray-200 hover:bg-gray-50 cursor-pointer ${allNewTebligatIds.has(row.id) ? 'bg-emerald-50/60 border-l-2 border-l-emerald-400' : ''}`}
                                                                                        onClick={() =>
                                                                                            onSelectTebligat(
                                                                                                row
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <td className="px-4 py-2 whitespace-nowrap text-xs font-mono">
                                                                                            {row.document_no ||
                                                                                                '-'}
                                                                                        </td>
                                                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                                                            {row.sender ||
                                                                                                '-'}
                                                                                        </td>
                                                                                        <td className="px-4 py-2 max-w-xs truncate">
                                                                                            {row.subject ||
                                                                                                '-'}
                                                                                        </td>
                                                                                        <td className="px-4 py-2 whitespace-nowrap">
                                                                                            <span
                                                                                                className={`px-2 py-1 text-xs rounded-full ${row.status === 'Tebligat yok' ? 'bg-gray-100 text-gray-600' : row.status?.toLowerCase().includes('okundu') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                                                                                            >
                                                                                                {row.status ||
                                                                                                    '-'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td
                                                                                            className="px-4 py-2 whitespace-nowrap"
                                                                                            onClick={(
                                                                                                e
                                                                                            ) =>
                                                                                                e.stopPropagation()
                                                                                            }
                                                                                        >
                                                                                            {row.document_path ? (
                                                                                                <div className="flex gap-2">
                                                                                                    <button
                                                                                                        onClick={() =>
                                                                                                            onOpenDocument(
                                                                                                                row.document_path!
                                                                                                            )
                                                                                                        }
                                                                                                        className="text-sky-600 hover:text-sky-700"
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
                                                                                                                strokeWidth={
                                                                                                                    2
                                                                                                                }
                                                                                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                                                                            />
                                                                                                            <path
                                                                                                                strokeLinecap="round"
                                                                                                                strokeLinejoin="round"
                                                                                                                strokeWidth={
                                                                                                                    2
                                                                                                                }
                                                                                                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                                                                            />
                                                                                                        </svg>
                                                                                                    </button>
                                                                                                    <button
                                                                                                        onClick={() =>
                                                                                                            onShareDocument(
                                                                                                                row.document_path!
                                                                                                            )
                                                                                                        }
                                                                                                        className="text-emerald-600 hover:text-emerald-700"
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
                                                                                                                strokeWidth={
                                                                                                                    2
                                                                                                                }
                                                                                                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                                                                                            />
                                                                                                        </svg>
                                                                                                    </button>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <button
                                                                                                    onClick={() =>
                                                                                                        onFetchDocument(
                                                                                                            row.id
                                                                                                        )
                                                                                                    }
                                                                                                    disabled={
                                                                                                        fetchingDocumentId ===
                                                                                                        row.id
                                                                                                    }
                                                                                                    className="text-amber-500 hover:text-amber-600 disabled:opacity-50"
                                                                                                    title="&#304;ndir"
                                                                                                >
                                                                                                    {fetchingDocumentId ===
                                                                                                    row.id ? (
                                                                                                        <svg
                                                                                                            className="animate-spin h-4 w-4"
                                                                                                            xmlns="http://www.w3.org/2000/svg"
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
                                                                                                                strokeWidth={
                                                                                                                    2
                                                                                                                }
                                                                                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                                                                            />
                                                                                                        </svg>
                                                                                                    )}
                                                                                                </button>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                )
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
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
    );
};

export default ResultsView;
