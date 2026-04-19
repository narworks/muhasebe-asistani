import React, { useState } from 'react';
import type { ScanHistoryItem } from '../types';

interface Props {
    data: ScanHistoryItem[];
    onClose: () => void;
    expandedHistoryId: number | null;
    onToggleExpand: (id: number) => void;
    diagnosticEnabled?: boolean;
}

export default function ScanHistoryModal({
    data,
    onClose,
    expandedHistoryId,
    onToggleExpand,
    diagnosticEnabled = false,
}: Props) {
    const [exportingId, setExportingId] = useState<number | null>(null);

    const handleExportDiag = async (scanId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setExportingId(scanId);
        try {
            const result = await window.electronAPI.exportDiagBundle(scanId);
            if (result.saved) {
                alert(`Tan\u0131 paketi kaydedildi:\n${result.path}`);
            } else if (result.reason !== 'cancelled') {
                alert(`Hata: ${result.reason || 'Bilinmeyen hata'}`);
            }
        } finally {
            setExportingId(null);
        }
    };
    return (
        <div
            className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800">Tarama Ge&ccedil;mi&#351;i</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700 text-sm px-3 py-1 rounded hover:bg-gray-100"
                    >
                        Kapat
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto rounded-b-xl">
                    {data.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            Hen&uuml;z tarama ge&ccedil;mi&#351;i yok.
                        </div>
                    ) : (
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left">Tarih</th>
                                    <th className="px-4 py-2 text-left">Tip</th>
                                    <th className="px-4 py-2 text-center">M&uuml;kellef</th>
                                    <th className="px-4 py-2 text-center">
                                        Ba&#351;ar&#305;l&#305;
                                    </th>
                                    <th className="px-4 py-2 text-center">Hatal&#305;</th>
                                    <th className="px-4 py-2 text-right">S&uuml;re</th>
                                    {diagnosticEnabled && (
                                        <th className="px-4 py-2 text-center">Tan&#305;</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.map((h) => {
                                    const d = h.startedAt ? new Date(h.startedAt) : null;
                                    const durMin = h.durationSeconds
                                        ? Math.ceil(h.durationSeconds / 60)
                                        : 0;
                                    const typeLabels: Record<string, string> = {
                                        full: 'Tam',
                                        preview: '\u00d6nizleme',
                                        selected: 'Se\u00e7ili',
                                        scheduled: 'Zamanl\u0131',
                                        retry_failed: 'Yeniden',
                                    };
                                    const isExpanded = expandedHistoryId === h.id;
                                    const hasResults = h.results && h.results.length > 0;
                                    return (
                                        <React.Fragment key={h.id}>
                                            <tr
                                                className={`hover:bg-gray-50 ${hasResults ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
                                                onClick={() => hasResults && onToggleExpand(h.id)}
                                            >
                                                <td className="px-4 py-2 whitespace-nowrap text-gray-700">
                                                    {hasResults && (
                                                        <span
                                                            className={`inline-block mr-1.5 text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                        >
                                                            &#9654;
                                                        </span>
                                                    )}
                                                    {d
                                                        ? d.toLocaleDateString('tr-TR', {
                                                              day: '2-digit',
                                                              month: '2-digit',
                                                              year: 'numeric',
                                                              hour: '2-digit',
                                                              minute: '2-digit',
                                                          })
                                                        : '-'}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                                        {typeLabels[h.scanType || 'full'] ||
                                                            h.scanType}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-center text-gray-700">
                                                    {h.totalClients}
                                                </td>
                                                <td className="px-4 py-2 text-center text-emerald-600 font-medium">
                                                    {h.successCount}
                                                </td>
                                                <td className="px-4 py-2 text-center text-red-500 font-medium">
                                                    {h.errorCount || 0}
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-500">
                                                    {durMin > 60
                                                        ? `${Math.floor(durMin / 60)}s ${durMin % 60}dk`
                                                        : `${durMin} dk`}
                                                </td>
                                                {diagnosticEnabled && (
                                                    <td className="px-4 py-2 text-center">
                                                        <button
                                                            onClick={(e) =>
                                                                handleExportDiag(h.id, e)
                                                            }
                                                            disabled={exportingId === h.id}
                                                            className="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                                                            title="Tan\u0131 paketini indir (anonim)"
                                                        >
                                                            {exportingId === h.id
                                                                ? '\u23f3'
                                                                : '\u2b07 Tan\u0131'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                            {isExpanded &&
                                                hasResults &&
                                                (() => {
                                                    const errLabels: Record<string, string> = {
                                                        wrong_credentials:
                                                            'Yanl\u0131\u015f \u015fifre',
                                                        account_locked: 'Hesap kilitli',
                                                        captcha_failed: 'CAPTCHA',
                                                        network_timeout:
                                                            'Zaman a\u015f\u0131m\u0131',
                                                        ip_blocked: 'IP engeli',
                                                        unknown: 'Hata',
                                                    };
                                                    return (
                                                        <tr>
                                                            <td
                                                                colSpan={diagnosticEnabled ? 7 : 6}
                                                                className="px-4 py-2 bg-gray-50"
                                                            >
                                                                <div className="grid grid-cols-2 gap-1.5 text-xs">
                                                                    {h.results.map((r, ri) => (
                                                                        <div
                                                                            key={ri}
                                                                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded ${r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
                                                                            title={
                                                                                !r.success &&
                                                                                r.errorMessage
                                                                                    ? r.errorMessage
                                                                                    : undefined
                                                                            }
                                                                        >
                                                                            <span>
                                                                                {r.success
                                                                                    ? '\u2713'
                                                                                    : '\u2717'}
                                                                            </span>
                                                                            <span className="font-medium truncate">
                                                                                {r.firmName}
                                                                            </span>
                                                                            {!r.success && (
                                                                                <span className="text-red-400 text-[10px] ml-auto shrink-0 px-1.5 py-0.5 rounded bg-red-100">
                                                                                    {errLabels[
                                                                                        r.errorType ||
                                                                                            'unknown'
                                                                                    ] ||
                                                                                        r.errorType ||
                                                                                        'Hata'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })()}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
