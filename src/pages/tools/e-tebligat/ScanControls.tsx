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
    onStartScan: () => void;
    onStopScan: () => void;
    onResumeScan: () => void;
    onPurchaseCredits: () => void;
    onRetryFailed: () => void;
    onOpenHistory: () => void;
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
    onStartScan,
    onStopScan,
    onResumeScan,
    onPurchaseCredits,
    onRetryFailed,
    onOpenHistory,
}) => {
    return (
        <>
            {/* Tarama */}
            <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-gray-500">
                    Otomatik sorgulama durumunu buradan takip edebilirsiniz.
                </p>

                <div className="flex space-x-3">
                    <button
                        onClick={onStartScan}
                        disabled={scanning}
                        className={`flex items-center px-6 py-3 rounded-lg font-bold text-white shadow-md transition-all ${
                            scanning
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg'
                        }`}
                    >
                        {scanning ? (
                            <>
                                <svg
                                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                                Taranıyor...
                            </>
                        ) : (
                            <>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5 mr-2"
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
                                Taramayı Başlat
                            </>
                        )}
                    </button>
                    {scanning && (
                        <button
                            onClick={onStopScan}
                            className="flex items-center px-4 py-3 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-md transition-all"
                        >
                            Durdur
                        </button>
                    )}
                </div>
                {/* Estimated duration + retry/history buttons */}
                <div className="flex flex-wrap items-center gap-3 mb-2">
                    {scanEstimate && scanEstimate.count > 0 && !scanning && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                            {scanEstimate.count} m&uuml;kellef &middot; ~
                            {scanEstimate.estimatedMinutes < 60
                                ? `${scanEstimate.estimatedMinutes} dk`
                                : `${Math.floor(scanEstimate.estimatedMinutes / 60)}s ${scanEstimate.estimatedMinutes % 60}dk`}
                        </span>
                    )}
                    {lastFailedIds.length > 0 && !scanning && (
                        <button
                            type="button"
                            onClick={onRetryFailed}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-amber-500/40 text-amber-700 hover:bg-amber-50"
                            title={`Son taramadaki ${lastFailedIds.length} ba\u015Far\u0131s\u0131z m\u00FCkellefi tekrar dene`}
                        >
                            Ba&#351;ar&#305;s&#305;zlar&#305; Tekrar Dene ({lastFailedIds.length})
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onOpenHistory}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        Tarama Ge&ccedil;mi&#351;i
                    </button>
                </div>
                {/* Rate limit counters */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>
                        Bug&uuml;n:{' '}
                        <span className="font-semibold text-slate-300">
                            {rateLimits.dailyUsed}/{rateLimits.dailyLimit}
                        </span>
                    </span>
                    <span>
                        Bu saat:{' '}
                        <span className="font-semibold text-slate-300">
                            {rateLimits.hourlyUsed}/{rateLimits.hourlyLimit}
                        </span>
                    </span>
                </div>
            </div>

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

            {/* Progress Bar */}
            {scanning && scanProgress && (
                <div className="mb-4 p-3 bg-gray-100 rounded-lg">
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
                </div>
            )}
        </>
    );
};

export default ScanControls;
