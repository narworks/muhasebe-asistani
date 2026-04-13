import React from 'react';

interface ScanControlsProps {
    scanning: boolean;
    scanProgress: {
        current: number;
        total: number;
        currentClient: string | null;
        errors: number;
        successes: number;
        completed?: boolean;
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

    return (
        <>
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

            <div className="text-center py-6">
                {/* Title area */}
                <h2 className="text-lg font-semibold text-gray-700 mb-1">Tebligatları Tara</h2>
                <p className="text-sm text-gray-400 mb-6">
                    T&uuml;m m&uuml;kelleflerin G&#304;B portalı kontrol edilir ve yeni tebligatlar
                    otomatik indirilir.
                </p>

                {/* Onboarding banner — shown when there are new (never-scanned) clients */}
                {!scanning && !scanProgress && hasNewClients && clientCount > 0 && (
                    <div className="mb-4 mx-auto max-w-lg p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-left">
                        <p className="text-sm font-semibold text-emerald-800 mb-1">
                            &#304;lk kurulum &mdash; Ke&#351;if ile ba&#351;lay&#305;n
                        </p>
                        <p className="text-xs text-emerald-700 mb-3">
                            {newClientsCount} yeni m&uuml;kellef eklendi. &Ouml;nce ke&#351;if
                            yaparak G&#304;B&apos;deki tebligatlar&#305;
                            g&ouml;r&uuml;nt&uuml;leyin, sonra indirmek istediklerinizi
                            se&ccedil;in. B&ouml;ylece saatlerce beklemek yerine sadece
                            ihtiyac&#305;n&#305;z olanlar&#305; indirirsiniz.
                        </p>
                        <button
                            onClick={onStartPreview}
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
                {!scanning && !scanProgress && !hasNewClients && (
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <button
                            onClick={onStartScan}
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

                {/* Progress bar - replaces buttons when scanning */}
                {scanning && scanProgress && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg text-left">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>
                                {scanProgress.currentClient
                                    ? `İşlem: ${scanProgress.currentClient}`
                                    : 'Bekleniyor...'}
                            </span>
                            <span>
                                {scanProgress.current}/{scanProgress.total}
                            </span>
                        </div>
                        <div className="w-full bg-gray-300 rounded-full h-2.5">
                            <div
                                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>
                                {scanProgress.successes} başarılı, {scanProgress.errors} hata
                            </span>
                            <span>%{progressPercent}</span>
                        </div>
                        <div className="flex justify-center mt-3">
                            <button
                                onClick={onStopScan}
                                className="flex items-center px-4 py-2 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-md transition-all text-sm"
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
                <p className="text-xs text-gray-400 mb-4">
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
