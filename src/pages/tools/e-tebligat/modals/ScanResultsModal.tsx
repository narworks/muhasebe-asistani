import React from 'react';
import type { ScanResultItem } from '../types';

interface Props {
    data: ScanResultItem[];
    onClose: () => void;
    onRetryFailed: (failedIds: number[]) => void;
}

export default function ScanResultsModal({ data, onClose, onRetryFailed }: Props) {
    const total = data.length;
    const successes = data.filter((r) => r.success).length;
    const failures = data.filter((r) => !r.success);
    const byErrorType = failures.reduce(
        (acc, r) => {
            const key = r.errorType || 'unknown';
            if (!acc[key]) acc[key] = [];
            acc[key].push(r);
            return acc;
        },
        {} as Record<string, ScanResultItem[]>
    );

    const errorLabels: Record<string, { icon: string; label: string }> = {
        wrong_credentials: {
            icon: '\uD83D\uDD10',
            label: 'Yanl\u0131\u015f \u015fifre',
        },
        account_locked: { icon: '\uD83D\uDD12', label: 'Hesap kilitli' },
        captcha_failed: { icon: '\uD83E\uDD16', label: 'CAPTCHA hatas\u0131' },
        network_timeout: {
            icon: '\u23F1\uFE0F',
            label: 'Ba\u011flant\u0131 zaman a\u015f\u0131m\u0131',
        },
        ip_blocked: { icon: '\u26D4', label: 'IP engellendi' },
        unknown: { icon: '\u26A0\uFE0F', label: 'Bilinmeyen hata' },
    };

    const downloadCsv = () => {
        const rows = [['Firma', 'Durum', 'Hata Tipi', 'Hata Mesaj\u0131']];
        data.forEach((r) => {
            rows.push([
                r.firmName,
                r.success ? 'Ba\u015far\u0131l\u0131' : 'Ba\u015far\u0131s\u0131z',
                r.errorType || '',
                (r.errorMessage || '').replace(/[\r\n]+/g, ' '),
            ]);
        });
        const csv = rows
            .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tarama-sonuclari-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-gray-200 bg-indigo-50 rounded-t-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                Tarama Tamamland&#305;
                            </h2>
                            <p className="text-sm text-gray-600 mt-0.5">
                                <span className="text-emerald-600 font-semibold">
                                    {successes} ba&#351;ar&#305;l&#305;
                                </span>
                                {' / '}
                                <span className="text-red-500 font-semibold">
                                    {failures.length} hatal&#305;
                                </span>
                                {' / '}
                                <span className="text-gray-600">{total} toplam</span>
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-700 text-sm px-3 py-1 rounded hover:bg-white"
                        >
                            Kapat
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {failures.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-emerald-600 text-lg">
                                {'\u2705'} T&uuml;m m&uuml;kellefler ba&#351;ar&#305;yla
                                tarand&#305;!
                            </p>
                        </div>
                    ) : (
                        Object.entries(byErrorType).map(([type, items]) => {
                            const info = errorLabels[type] || errorLabels.unknown;
                            return (
                                <div key={type} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-semibold text-gray-800">
                                            <span className="mr-1.5">{info.icon}</span>
                                            {info.label}
                                        </p>
                                        <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                            {items.length} m&uuml;kellef
                                        </span>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                                        {items.map((item) => (
                                            <div
                                                key={item.clientId}
                                                className="text-xs text-gray-600 pl-5"
                                            >
                                                &bull; {item.firmName}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-end gap-2">
                    {failures.length > 0 && (
                        <button
                            onClick={downloadCsv}
                            className="text-xs font-semibold px-3 py-1.5 rounded border border-indigo-500/40 text-indigo-600 hover:bg-indigo-50"
                        >
                            CSV Olarak &#304;ndir
                        </button>
                    )}
                    {failures.length > 0 && (
                        <button
                            onClick={() => onRetryFailed(failures.map((f) => f.clientId))}
                            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-md"
                            title="Başarısız mükellefleri yeniden tara"
                        >
                            {'🔄'} {failures.length} hatalıyı tekrar tara
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-md"
                    >
                        Tamam
                    </button>
                </div>
            </div>
        </div>
    );
}
