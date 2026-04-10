import React from 'react';
import type { PreviewClientResult, PreviewTebligat, PreviewSelectionMode } from '../types';

interface Props {
    results: PreviewClientResult[];
    selections: Record<number, PreviewSelectionMode>;
    onSelectionChange: (clientId: number, mode: PreviewSelectionMode) => void;
    onSetAllMode: (mode: PreviewSelectionMode) => void;
    onClose: () => void;
    onDownload: () => void;
    downloading: boolean;
}

export default function PreviewModal({
    results,
    selections,
    onSelectionChange,
    onSetAllMode,
    onClose,
    onDownload,
    downloading,
}: Props) {
    const parseDate = (s: string | null): Date | null => {
        if (!s) return null;
        // Handle DD/MM/YYYY HH:MM:SS format
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

    const countInRange = (
        list: PreviewTebligat[] | undefined,
        from: Date | null
    ): { total: number; newCount: number; existingCount: number } => {
        if (!list) return { total: 0, newCount: 0, existingCount: 0 };
        const filtered = from
            ? list.filter((t) => {
                  const d = parseDate(t.notificationDate || t.sendDate);
                  return d && d >= from;
              })
            : list;
        const existing = filtered.filter((t) => t._alreadyDownloaded).length;
        return {
            total: filtered.length,
            newCount: filtered.length - existing,
            existingCount: existing,
        };
    };

    const getSelectedForClient = (r: PreviewClientResult): PreviewTebligat[] => {
        const mode = selections[r.clientId] || 'skip';
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

    const totalSelected = results.reduce(
        (sum, r) => sum + (r.ok ? getSelectedForClient(r).length : 0),
        0
    );
    // ~3sn per document + 5sn inter-doc delay + 15sn login per client
    const activeClients = results.filter((r) => r.ok && getSelectedForClient(r).length > 0).length;
    const estimatedMin = Math.max(1, Math.ceil((totalSelected * 8 + activeClients * 25) / 60));

    return (
        <div
            className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-gray-200 bg-emerald-50 rounded-t-xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                G&#304;B&apos;de Bulunan Tebligatlar
                            </h2>
                            <p className="text-sm text-gray-600 mt-0.5">
                                Toplam {results.reduce((s, r) => s + (r.count || 0), 0)} tebligat
                                bulundu. Her m&uuml;kellef i&ccedil;in ne kadar&#305;n&#305;
                                indirmek istedi&#287;inizi se&ccedil;in.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-700 text-sm px-3 py-1 rounded hover:bg-white"
                        >
                            Kapat
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        <span className="text-xs text-gray-500 mr-1 self-center">
                            Hepsine uygula:
                        </span>
                        {(
                            [
                                ['skip', 'Atla'],
                                ['last15', 'Son 15 g&uuml;n'],
                                ['last30', 'Son 30 g&uuml;n'],
                                ['last6m', 'Son 6 ay'],
                                ['thisYear', 'Bu y&#305;l'],
                                ['all', 'T&uuml;m&uuml;'],
                            ] as const
                        ).map(([mode, label]) => (
                            <button
                                key={mode}
                                onClick={() => onSetAllMode(mode as PreviewSelectionMode)}
                                className="text-xs px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-700 hover:bg-emerald-100"
                                dangerouslySetInnerHTML={{ __html: label }}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {results.map((r) => {
                        if (!r.ok) {
                            return (
                                <div
                                    key={r.clientId}
                                    className="border border-red-200 bg-red-50 rounded-lg p-3"
                                >
                                    <p className="text-sm font-semibold text-gray-800">
                                        {r.firmName}
                                    </p>
                                    <p className="text-xs text-red-600 mt-1">
                                        Ke&#351;if ba&#351;ar&#305;s&#305;z: {r.error}
                                    </p>
                                </div>
                            );
                        }
                        const counts = {
                            last15: countInRange(r.tebligatList, last15),
                            last30: countInRange(r.tebligatList, last30),
                            last6m: countInRange(r.tebligatList, last6m),
                            thisYear: countInRange(r.tebligatList, startOfYear),
                            all: r.tebligatList?.length || 0,
                        };
                        const currentMode = selections[r.clientId] || 'skip';
                        return (
                            <div key={r.clientId} className="border border-gray-200 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-semibold text-gray-800">
                                        {r.firmName}
                                    </p>
                                    <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                        {r.count} tebligat
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
                                    {(
                                        [
                                            ['skip', 'Atla', null],
                                            ['last15', 'Son 15 g&uuml;n', counts.last15],
                                            ['last30', 'Son 30 g&uuml;n', counts.last30],
                                            ['last6m', 'Son 6 ay', counts.last6m],
                                            ['thisYear', 'Bu y&#305;l', counts.thisYear],
                                            ['all', 'T&uuml;m&uuml;', counts.all],
                                        ] as const
                                    ).map(([mode, label, count]) => (
                                        <label
                                            key={mode}
                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                                                currentMode === mode
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name={`preview-${r.clientId}`}
                                                checked={currentMode === mode}
                                                onChange={() =>
                                                    onSelectionChange(
                                                        r.clientId,
                                                        mode as PreviewSelectionMode
                                                    )
                                                }
                                                className="h-3 w-3"
                                            />
                                            <span
                                                className="flex-1"
                                                dangerouslySetInnerHTML={{
                                                    __html: label,
                                                }}
                                            />
                                            {count !== null && (
                                                <span className="text-gray-400">
                                                    {typeof count === 'number' ? (
                                                        `(${count})`
                                                    ) : (
                                                        <>
                                                            ({count.total}
                                                            {count.existingCount > 0 && (
                                                                <>
                                                                    {' '}
                                                                    <span
                                                                        className="text-emerald-500"
                                                                        title="Yeni"
                                                                    >
                                                                        {count.newCount}
                                                                        &#x2197;
                                                                    </span>{' '}
                                                                    <span
                                                                        className="text-gray-300"
                                                                        title="Mevcut"
                                                                    >
                                                                        {count.existingCount}
                                                                        &#x2713;
                                                                    </span>
                                                                </>
                                                            )}
                                                            )
                                                        </>
                                                    )}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                        <span className="font-semibold">{totalSelected}</span> tebligat indirilecek
                        · Tahmini s&uuml;re:{' '}
                        <span className="font-semibold">~{estimatedMin} dk</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                            &#304;ptal
                        </button>
                        <button
                            onClick={onDownload}
                            disabled={totalSelected === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors disabled:opacity-50"
                        >
                            Se&ccedil;ilenleri &#304;ndir &#8594;
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
