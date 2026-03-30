import React, { useState, useEffect } from 'react';
import type { UpdateStatus } from '../types';

type BannerState = 'hidden' | 'available' | 'downloading' | 'downloaded' | 'error';

const UpdateBanner: React.FC = () => {
    const [state, setState] = useState<BannerState>('hidden');
    const [version, setVersion] = useState<string>('');
    const [percent, setPercent] = useState(0);
    const [speedMB, setSpeedMB] = useState('0');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        window.electronAPI.onUpdateStatus((update: UpdateStatus) => {
            switch (update.status) {
                case 'update-available':
                    setState('available');
                    setVersion(update.version ?? '');
                    break;
                case 'update-download-progress':
                    setState('downloading');
                    setPercent(Math.round(update.percent ?? 0));
                    setSpeedMB(((update.bytesPerSecond ?? 0) / 1048576).toFixed(1));
                    break;
                case 'update-downloaded':
                    setState('downloaded');
                    setVersion(update.version ?? '');
                    break;
                case 'update-error':
                    setState('error');
                    setErrorMsg(update.message ?? 'Bilinmeyen hata');
                    break;
            }
        });
        return () => window.electronAPI.removeUpdateListeners();
    }, []);

    const handleDownload = () => {
        setState('downloading');
        setPercent(0);
        window.electronAPI.startUpdateDownload();
    };

    const handleRestart = () => {
        window.electronAPI.restartAndUpdate();
    };

    const handleDismiss = () => {
        setState('hidden');
    };

    if (state === 'hidden') return null;

    // "Güncelleme mevcut" banner
    if (state === 'available') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 border-t border-slate-700 px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="text-slate-300">
                        Yeni sürüm mevcut:{' '}
                        <span className="text-white font-medium">v{version}</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDismiss}
                        className="text-slate-500 hover:text-slate-300 px-3 py-1.5 text-sm transition-colors"
                    >
                        Daha Sonra
                    </button>
                    <button
                        onClick={handleDownload}
                        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
                    >
                        Güncelle
                    </button>
                </div>
            </div>
        );
    }

    // "İndiriliyor" banner — progress bar (Windows) veya indeterminate spinner (macOS)
    if (state === 'downloading') {
        const hasProgress = percent > 0;
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50">
                {hasProgress && (
                    <div className="h-1 bg-slate-700">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                )}
                <div className="bg-slate-900/95 border-t border-slate-700 px-4 py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                        <svg
                            className="animate-spin h-4 w-4 text-indigo-400"
                            viewBox="0 0 24 24"
                            fill="none"
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
                        <span className="text-slate-300">
                            {hasProgress ? (
                                <>
                                    Güncelleme indiriliyor...{' '}
                                    <span className="text-white font-medium">%{percent}</span>
                                </>
                            ) : (
                                <>Güncelleme indiriliyor...</>
                            )}
                        </span>
                    </div>
                    {hasProgress && <span className="text-slate-500 text-xs">{speedMB} MB/s</span>}
                </div>
            </div>
        );
    }

    // "İndirme tamamlandı" banner
    if (state === 'downloaded') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-indigo-600 px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                    <svg
                        className="h-5 w-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span className="text-white">
                        Güncelleme hazır{version ? ` (v${version})` : ''}. Yeniden başlatarak
                        yükleyin.
                    </span>
                </div>
                <button
                    onClick={handleRestart}
                    className="bg-white text-indigo-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
                >
                    Yeniden Başlat
                </button>
            </div>
        );
    }

    // Hata banner
    if (state === 'error') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900/90 border-t border-red-700 px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-red-200">Güncelleme hatası: {errorMsg}</span>
                <button onClick={handleDismiss} className="text-red-400 hover:text-red-200 text-xs">
                    Kapat
                </button>
            </div>
        );
    }

    return null;
};

export default UpdateBanner;
