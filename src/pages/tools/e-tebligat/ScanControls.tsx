import React, { useState, useEffect } from 'react';

const PROGRESS_TIPS = [
    '\u0130\u015Flem arka planda g\u00FCvenle devam ediyor.',
    '\u0130lk kontrol en uzun s\u00FCrer \u2014 sonraki kontroller \u00E7ok daha h\u0131zl\u0131d\u0131r.',
    'Bilgisayar\u0131n\u0131z\u0131 uyku moduna almay\u0131n, i\u015Flem kesintiye u\u011Frayabilir.',
    '\u0130stedi\u011Finiz zaman \u201CDurdur\u201D ile i\u015Flemi kesebilir, sonra kald\u0131\u011F\u0131n\u0131z yerden devam edebilirsiniz.',
    'Tebligatlar otomatik olarak m\u00FCkellef klas\u00F6rlerine kaydedilir.',
    '\u0130\u015Flem bitti\u011Finde detayl\u0131 rapor g\u00F6sterilecek.',
    'M\u00FCkellef say\u0131s\u0131 artt\u0131k\u00E7a kontrol s\u00FCresi de uzar \u2014 bu normaldir.',
    '\u0130\u015Flemi gece ba\u015Flat\u0131p sabah sonu\u00E7lar\u0131 g\u00F6rebilirsiniz.',
    'Her m\u00FCkellef s\u0131rayla kontrol edilir \u2014 g\u00FCvenli ve kesintisiz.',
];

const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds} sn`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}s ${m}dk`;
    return `${m} dk`;
};

interface ScanControlsProps {
    // Compact mode hides the heading/description and centers buttons in a single row.
    // Used inside Sonuçlar tab where vertical space is scarce.
    compact?: boolean;
    scanning: boolean;
    scanProgress: {
        current: number;
        total: number;
        currentClient: string | null;
        errors: number;
        successes: number;
        completed?: boolean;
        elapsedSeconds?: number;
        estimatedRemainingSeconds?: number;
    } | null;
    scanState: {
        canResume: boolean;
        processedCount: number;
        total: number;
        errors: number;
        successes: number;
        wasCancelled: boolean;
    } | null;
    rateLimits: {
        dailyUsed: number;
        dailyLimit: number;
        hourlyUsed: number;
        hourlyLimit: number;
    };
    scanEstimate: {
        count: number;
        estimatedMinutes: number;
    } | null;
    insufficientCredits: boolean;
    lastFailedIds: number[];
    progressPercent: number;
    clientCount: number;
    onStartScan: () => void;
    onStopScan: () => void;
    onResumeScan: () => void;
    onPurchaseCredits: () => void;
    onRetryFailed: () => void;
    onOpenHistory: () => void;
    // Keşif props
    onStartPreview: () => void;
    previewRunning: boolean;
    hasNewClients: boolean;
    newClientsCount: number;
}

const ScanControls: React.FC<ScanControlsProps> = ({
    compact = false,
    scanning,
    scanProgress,
    scanState,
    rateLimits,
    scanEstimate,
    insufficientCredits,
    lastFailedIds,
    progressPercent,
    clientCount,
    onStartScan,
    onStopScan,
    onResumeScan,
    onPurchaseCredits,
    onRetryFailed,
    onOpenHistory,
    onStartPreview,
    previewRunning,
    hasNewClients,
    newClientsCount,
}) => {
    const estimatedMin =
        scanEstimate && scanEstimate.estimatedMinutes < 60
            ? `${scanEstimate.estimatedMinutes} dk`
            : scanEstimate
              ? `${Math.floor(scanEstimate.estimatedMinutes / 60)}s ${scanEstimate.estimatedMinutes % 60}dk`
              : null;

    // Elapsed timer — counts up every second while scanning
    const [localElapsed, setLocalElapsed] = useState(0);
    const [tipIndex, setTipIndex] = useState(0);

    useEffect(() => {
        if (!scanning) {
            setLocalElapsed(0);
            return;
        }
        const interval = setInterval(() => setLocalElapsed((s) => s + 1), 1000);
        return () => clearInterval(interval);
    }, [scanning]);

    // Rotate tips every 15 seconds
    useEffect(() => {
        if (!scanning) return;
        const interval = setInterval(
            () => setTipIndex((i) => (i + 1) % PROGRESS_TIPS.length),
            15000
        );
        return () => clearInterval(interval);
    }, [scanning]);

    // Use backend elapsed if available, otherwise local counter
    const elapsed = scanProgress?.elapsedSeconds ?? localElapsed;
    const remaining = scanProgress?.estimatedRemainingSeconds ?? 0;

    // Dynamic tip with successes count
    const currentTip = PROGRESS_TIPS[tipIndex].replace(
        '{successes}',
        String(scanProgress?.successes ?? 0)
    );

    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<'scan' | 'preview' | null>(null);

    return (
        <>
            {/* Confirm Modal — shown before starting scan or preview */}
            {confirmAction && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setConfirmAction(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-gray-800 mb-2">
                            Tahmini S&uuml;re: ~{estimatedMin || '?'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {clientCount} m&uuml;kellefin tebligatlar&#305;{' '}
                            {confirmAction === 'preview' ? 'kontrol edilecek' : 'taranacak'}.
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800 space-y-1">
                            <p>Bu s&uuml;re boyunca:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                <li>Bilgisayar&#305;n&#305;z&#305; a&ccedil;&#305;k tutun</li>
                                <li>Uygulamay&#305; kapatmay&#305;n</li>
                                <li>&#304;nternet ba&#287;lant&#305;n&#305;z aktif olsun</li>
                            </ul>
                            <p className="mt-2">
                                &#304;stedi&#287;iniz zaman &ldquo;Durdur&rdquo; ile i&#351;lemi
                                kesebilir ve kald&#305;&#287;&#305;n&#305;z yerden devam
                                edebilirsiniz.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmAction(null)}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Vazge&ccedil;
                            </button>
                            <button
                                onClick={() => {
                                    const action = confirmAction;
                                    setConfirmAction(null);
                                    if (action === 'preview') onStartPreview();
                                    else onStartScan();
                                }}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm"
                            >
                                Ba&#351;lat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Resume / Restart Panel */}
            {!scanning && scanState && scanState.canResume && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-amber-800">
                                Tarama{' '}
                                {insufficientCredits
                                    ? 'kredi yetersizliğinden durdu'
                                    : scanState.wasCancelled
                                      ? 'durduruldu'
                                      : 'tamamlanamadı'}
                                : {scanState.processedCount}/{scanState.total} mükellef tarandı.
                            </p>
                            <p className="text-xs text-amber-600 mt-1">
                                {scanState.successes} başarılı, {scanState.errors} hatalı —{' '}
                                {scanState.total - scanState.processedCount} mükellef kaldı.
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            {insufficientCredits && (
                                <button
                                    onClick={onPurchaseCredits}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all"
                                >
                                    Kredi Satın Al
                                </button>
                            )}
                            <button
                                onClick={onResumeScan}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                            >
                                Devam Et
                            </button>
                            <button
                                onClick={onStartScan}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all"
                            >
                                Baştan Başlat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`text-center ${compact ? 'py-2' : 'py-6'}`}>
                {/* Title area — hidden in compact mode (Sonuçlar tab strip) */}
                {!compact && (
                    <>
                        <h2 className="text-lg font-semibold text-gray-700 mb-1">
                            Tebligatları Tara
                        </h2>
                        <p className="text-sm text-gray-400 mb-6">
                            T&uuml;m m&uuml;kelleflerin G&#304;B portalı kontrol edilir ve yeni
                            tebligatlar otomatik indirilir.
                        </p>
                    </>
                )}

                {/* Onboarding banner — shown when there are new (never-scanned) clients */}
                {!scanning && hasNewClients && clientCount > 0 && (
                    <div className="mb-4 mx-auto max-w-lg p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-left">
                        <p className="text-sm font-semibold text-emerald-800 mb-1">
                            &#304;lk kurulum &mdash; Ke&#351;if ile ba&#351;lay&#305;n
                        </p>
                        <p className="text-xs text-emerald-700 mb-2">
                            <strong>{newClientsCount} yeni m&uuml;kellef</strong> eklendi. &#304;lk
                            tarama, ge&ccedil;mi&#351; tebligatlar&#305;n t&uuml;m&uuml;n&uuml;
                            indirdi&#287;i i&ccedil;in uzun s&uuml;rebilir. Bu nedenle &ouml;nce
                            ke&#351;if yapman&#305;z&#305; &ouml;neririz:
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
                            <div className="bg-white rounded-md px-2 py-1.5 border border-emerald-100">
                                <div className="font-semibold text-emerald-800">
                                    Ke&#351;if (&ouml;nerilen)
                                </div>
                                <div className="text-emerald-700">
                                    ~{Math.max(1, Math.ceil(newClientsCount / 15))} dakika
                                </div>
                                <div className="text-gray-500 mt-0.5">
                                    Belgeleri g&ouml;r, se&ccedil;erek indir
                                </div>
                            </div>
                            <div className="bg-white rounded-md px-2 py-1.5 border border-amber-100">
                                <div className="font-semibold text-amber-800">
                                    Tam tarama (hi&ccedil; se&ccedil;im yok)
                                </div>
                                <div className="text-amber-700">
                                    ~{Math.ceil((newClientsCount * 50) / 60)} dakika
                                </div>
                                <div className="text-gray-500 mt-0.5">
                                    T&uuml;m ge&ccedil;mi&#351; iner
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setConfirmAction('preview')}
                            disabled={previewRunning}
                            className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 text-base"
                        >
                            {previewRunning
                                ? 'Ke\u015fif...'
                                : `Ke\u015ffe Ba\u015fla (${newClientsCount} m\u00fckellef)`}
                        </button>
                    </div>
                )}

                {/* Main buttons - centered (hidden when scanning) */}
                {!scanning && !hasNewClients && (
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <button
                            onClick={() => setConfirmAction('scan')}
                            disabled={scanning}
                            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg text-base shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            <span className="flex items-center gap-2">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                Taramay&#305; Ba&#351;lat
                            </span>
                        </button>
                        {clientCount > 0 && (
                            <button
                                onClick={onStartPreview}
                                disabled={previewRunning || scanning}
                                className="px-5 py-3 font-semibold rounded-lg border border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 transition-all disabled:opacity-50"
                                title="T&uuml;m m&uuml;kelleflerin tebligatlar&#305;n&#305; &ouml;nizle"
                            >
                                {previewRunning ? 'Ke\u015fif...' : 'Ke\u015fif'}
                            </button>
                        )}
                    </div>
                )}

                {/* Rich Progress Card - replaces buttons when scanning */}
                {scanning && scanProgress && (
                    <div className="mb-4 p-5 bg-white border border-gray-200 rounded-xl shadow-sm text-left">
                        {/* First-scan reassurance banner */}
                        {hasNewClients && (
                            <div className="mb-4 -mx-1 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <span className="text-base leading-none mt-0.5">&#9889;</span>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-emerald-800">
                                            &#304;lk kurulum yap&#305;l&#305;yor &mdash; bu bir
                                            kereliktir
                                        </div>
                                        <div className="text-[11px] text-emerald-700 mt-0.5">
                                            Sonraki taramalar &ccedil;ok daha h&#305;zl&#305;
                                            (sadece yeni gelen tebligatlar).
                                            Bilgisayar&#305;n&#305;z&#305; a&ccedil;&#305;k
                                            tutman&#305;z yeterli.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Progress bar + counts */}
                        <div className="flex justify-between text-sm text-gray-700 mb-2">
                            <span className="font-semibold">
                                {scanProgress.current} / {scanProgress.total} m&uuml;kellef
                            </span>
                            <span className="text-indigo-600 font-bold">%{progressPercent}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                            <div
                                className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Elapsed + Remaining */}
                        <div className="flex justify-between text-xs text-gray-500 mb-3">
                            <span>Ge&ccedil;en: {formatDuration(elapsed)}</span>
                            {remaining > 0 && scanProgress.current > 2 && (
                                <span>Kalan: ~{formatDuration(remaining)}</span>
                            )}
                        </div>

                        {/* Success / Error counters */}
                        <div className="flex items-center gap-4 text-xs mb-3">
                            <span className="text-emerald-600 font-medium">
                                {scanProgress.successes} ba&#351;ar&#305;l&#305;
                            </span>
                            {scanProgress.errors > 0 && (
                                <span className="text-red-500 font-medium">
                                    {scanProgress.errors} hatal&#305;
                                </span>
                            )}
                        </div>

                        {/* Current client */}
                        {scanProgress.currentClient && (
                            <div className="text-xs text-gray-500 mb-3">
                                <span className="inline-block w-2 h-2 bg-indigo-500 rounded-full animate-pulse mr-1.5" />
                                {scanProgress.currentClient} kontrol ediliyor...
                            </div>
                        )}

                        {/* Rotating tip */}
                        <div className="text-xs text-gray-400 italic mb-4 min-h-[1.2rem] transition-opacity duration-500">
                            {currentTip}
                        </div>

                        {/* Stop button */}
                        <div className="flex justify-center">
                            <button
                                onClick={onStopScan}
                                className="px-5 py-2 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-md transition-all text-sm"
                            >
                                Durdur
                            </button>
                        </div>
                    </div>
                )}

                {/* Scanning spinner without progress (initial phase) */}
                {scanning && !scanProgress && (
                    <div className="mb-4 flex items-center justify-center gap-3">
                        <svg
                            className="animate-spin h-5 w-5 text-indigo-600"
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
                            ></circle>
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                        </svg>
                        <span className="text-sm text-gray-600 font-medium">Taranıyor...</span>
                        <button
                            onClick={onStopScan}
                            className="ml-2 px-3 py-1.5 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all text-xs"
                        >
                            Durdur
                        </button>
                    </div>
                )}

                {/* Info line */}
                <p className={`text-xs text-gray-400 ${compact ? 'mb-1' : 'mb-4'}`}>
                    {clientCount} m&uuml;kellef
                    {estimatedMin && <> &middot; ~{estimatedMin}</>} &middot; Bug&uuml;n:{' '}
                    {rateLimits.dailyUsed}/{rateLimits.dailyLimit}
                </p>

                {/* Secondary actions */}
                <div className="flex items-center justify-center gap-4 text-xs">
                    <button
                        type="button"
                        onClick={onOpenHistory}
                        className="text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                        Tarama Ge&ccedil;mi&#351;i
                    </button>
                    {lastFailedIds.length > 0 && !scanning && (
                        <button
                            type="button"
                            onClick={onRetryFailed}
                            className="text-amber-600 hover:text-amber-700 font-medium transition-colors"
                            title={`Son taramadaki ${lastFailedIds.length} ba\u015Far\u0131s\u0131z m\u00FCkellefi tekrar dene`}
                        >
                            Ba&#351;ar&#305;s&#305;zlar&#305; Tekrar Dene ({lastFailedIds.length})
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default ScanControls;
