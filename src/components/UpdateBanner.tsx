import React, { useState, useEffect } from 'react';
import type { UpdateStatus } from '../types';

const UpdateBanner: React.FC = () => {
    const [status, setStatus] = useState<UpdateStatus | null>(null);

    useEffect(() => {
        window.electronAPI.onUpdateStatus((update) => setStatus(update));
        return () => window.electronAPI.removeUpdateListeners();
    }, []);

    if (!status) return null;

    const handleRestart = () => {
        window.electronAPI.restartAndUpdate();
    };

    if (status.status === 'update-download-progress') {
        const percent = Math.round(status.percent ?? 0);
        const speedMB = ((status.bytesPerSecond ?? 0) / 1048576).toFixed(1);
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50">
                <div className="h-1 bg-slate-700">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <div className="bg-slate-900/95 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-sm">
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
                            Güncelleme indiriliyor...{' '}
                            <span className="text-white font-medium">%{percent}</span>
                        </span>
                    </div>
                    <span className="text-slate-500 text-xs">{speedMB} MB/s</span>
                </div>
            </div>
        );
    }

    if (status.status === 'update-downloaded') {
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
                        Güncelleme hazır{status.version ? ` (v${status.version})` : ''}. Yeniden
                        başlatarak yükleyin.
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

    if (status.status === 'update-error') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-900/90 border-t border-red-700 px-4 py-2 text-sm text-red-200">
                Güncelleme hatası: {status.message ?? 'Bilinmeyen hata'}
            </div>
        );
    }

    return null;
};

export default UpdateBanner;
