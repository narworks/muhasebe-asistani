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

    // "Güncelleme mevcut" banner — no overlay, user can still interact
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

    // Hata banner — no overlay
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

    // Downloading / Downloaded — full screen overlay blocks all interaction
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 w-[420px] shadow-2xl text-center">
                {state === 'downloading' ? (
                    <>
                        <svg
                            className="animate-spin h-10 w-10 text-indigo-400 mx-auto mb-4"
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
                        <h3 className="text-white text-lg font-semibold mb-2">
                            Güncelleme İndiriliyor
                        </h3>
                        <p className="text-slate-400 text-sm mb-4">
                            Lütfen bekleyin, uygulama güncellenecek...
                        </p>
                        {percent > 0 ? (
                            <>
                                <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                                    <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>%{percent}</span>
                                    <span>{speedMB} MB/s</span>
                                </div>
                            </>
                        ) : (
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full animate-pulse w-2/3" />
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg
                                className="h-6 w-6 text-white"
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
                        </div>
                        <h3 className="text-white text-lg font-semibold mb-2">Güncelleme Hazır</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            v{version} indirildi. Uygulamayı yeniden başlatarak güncelleyin.
                        </p>
                        <button
                            onClick={handleRestart}
                            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors w-full"
                        >
                            Yeniden Başlat
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default UpdateBanner;
