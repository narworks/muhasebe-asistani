import React from 'react';
import { ScheduleStatus } from '../../../types';

export interface SchedulePanelProps {
    config: ScheduleStatus;
    loading: boolean;
    mode: 'finish' | 'start';
    startAtTime: string;
    onToggle: () => void;
    onTimeChange: (time: string) => void;
    onFrequencyChange: (freq: 'daily' | 'weekdays' | 'weekends' | 'custom') => void;
    onCustomDayToggle: (day: number) => void;
    onModeChange: (mode: 'finish' | 'start') => void;
    onStartAtTimeChange: (time: string) => void;
}

const SchedulePanel: React.FC<SchedulePanelProps> = ({
    config,
    loading,
    mode,
    startAtTime,
    onToggle,
    onTimeChange,
    onFrequencyChange,
    onCustomDayToggle,
    onModeChange,
    onStartAtTimeChange,
}) => {
    return (
        <div
            className={`mb-4 rounded-xl border overflow-hidden ${config.enabled ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100' : 'bg-gray-50 border-gray-200'}`}
        >
            {/* Header */}
            <div
                className={`px-6 py-4 flex items-center justify-between ${config.enabled ? 'bg-white/50 border-b border-indigo-100' : ''}`}
            >
                <div className="flex items-center gap-3">
                    <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.enabled ? 'bg-indigo-100' : 'bg-gray-200'}`}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 ${config.enabled ? 'text-indigo-600' : 'text-gray-500'}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Zamanlı Tarama</h2>
                        <p className="text-xs text-gray-500">
                            {config.enabled
                                ? 'Belirtilen saatte tarama tamamlanır'
                                : 'Otomatik zamanlı tarama kapalı'}
                        </p>
                    </div>
                </div>
                {/* Toggle Switch */}
                <button
                    onClick={onToggle}
                    disabled={loading}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        config.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                            config.enabled ? 'translate-x-8' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {config.enabled && (
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - Time & Frequency */}
                        <div className="space-y-5">
                            {/* Finish By Time */}
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4 text-indigo-500"
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
                                    Zamanlama
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => onModeChange('finish')}
                                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === 'finish' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Biti&#351; Saati
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onModeChange('start')}
                                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === 'start' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        Ba&#351;lang&#305;&ccedil; Saati
                                    </button>
                                </div>
                                {mode === 'finish' ? (
                                    <>
                                        <input
                                            type="time"
                                            value={config.finishByTime || config.time}
                                            onChange={(e) => onTimeChange(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <p className="mt-2 text-xs text-gray-500">
                                            Tarama bu saate kadar tamamlanacak şekilde otomatik
                                            başlatılır
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <input
                                            type="time"
                                            value={startAtTime}
                                            onChange={(e) => onStartAtTimeChange(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-semibold text-gray-800 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <p className="mt-2 text-xs text-gray-500">
                                            Tarama tam bu saatte ba&#351;lat&#305;l&#305;r
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* Sleep warning */}
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                                <span className="font-semibold">Not:</span> Zamanlı tarama için
                                uygulamanın açık ve bilgisayarın uyku modunda olmaması gerekir.
                                Tarama sırasında uyku modu otomatik olarak engellenir. Kaçırılan
                                taramalar uygulama açıldığında otomatik başlatılır.
                            </div>

                            {/* Frequency Selection */}
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4 text-indigo-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    Tekrar Sıklığı
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { value: 'daily', label: 'Her Gün', icon: '📅' },
                                        {
                                            value: 'weekdays',
                                            label: 'Hafta İçi',
                                            icon: '💼',
                                        },
                                        {
                                            value: 'weekends',
                                            label: 'Hafta Sonu',
                                            icon: '🌴',
                                        },
                                        { value: 'custom', label: 'Özel', icon: '⚙️' },
                                    ].map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() =>
                                                onFrequencyChange(
                                                    option.value as
                                                        | 'daily'
                                                        | 'weekdays'
                                                        | 'weekends'
                                                        | 'custom'
                                                )
                                            }
                                            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                                config.frequency === option.value
                                                    ? 'bg-indigo-600 text-white shadow-md'
                                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                                            }`}
                                        >
                                            <span>{option.icon}</span>
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom Days Selection */}
                            {config.frequency === 'custom' && (
                                <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
                                    <label className="block text-sm font-medium text-gray-700 mb-3">
                                        Günler Seçin
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { value: 1, label: 'Pzt' },
                                            { value: 2, label: 'Sal' },
                                            { value: 3, label: 'Çar' },
                                            { value: 4, label: 'Per' },
                                            { value: 5, label: 'Cum' },
                                            { value: 6, label: 'Cmt' },
                                            { value: 0, label: 'Paz' },
                                        ].map((day) => (
                                            <button
                                                key={day.value}
                                                type="button"
                                                onClick={() => onCustomDayToggle(day.value)}
                                                className={`w-12 h-10 rounded-lg text-sm font-semibold transition-all ${
                                                    (config.customDays ?? []).includes(day.value)
                                                        ? 'bg-indigo-600 text-white shadow-md'
                                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                                                }`}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Status & Info */}
                        <div className="space-y-4">
                            {/* Schedule Status Card */}
                            <div
                                className={`rounded-lg p-5 ${config.enabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div
                                        className={`w-3 h-3 rounded-full ${config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}
                                    />
                                    <span
                                        className={`font-semibold ${config.enabled ? 'text-emerald-700' : 'text-gray-600'}`}
                                    >
                                        {config.enabled ? 'Zamanlama Aktif' : 'Zamanlama Kapalı'}
                                    </span>
                                </div>

                                {config.enabled && config.clientCount > 0 && (
                                    <div className="space-y-3">
                                        {/* Estimated Duration */}
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">Tahmini Süre:</span>
                                            <span className="font-semibold text-gray-800">
                                                ~{config.estimatedDurationMinutes} dk
                                            </span>
                                        </div>

                                        {/* Client Count */}
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-600">Aktif Mükellef:</span>
                                            <span className="font-semibold text-gray-800">
                                                {config.clientCount} adet
                                            </span>
                                        </div>

                                        {/* Estimated Start Time */}
                                        {config.estimatedStartTime && (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-600">
                                                    Başlama Saati:
                                                </span>
                                                <span className="font-semibold text-indigo-600">
                                                    {new Date(
                                                        config.estimatedStartTime
                                                    ).toLocaleTimeString('tr-TR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                        )}

                                        <hr className="border-gray-200" />

                                        {/* Next Scan */}
                                        {config.nextScheduledScanAt && (
                                            <div className="bg-white rounded-lg p-3 border border-gray-100">
                                                <p className="text-xs text-gray-500 mb-1">
                                                    Sonraki Tarama (Bitiş)
                                                </p>
                                                <p className="font-semibold text-gray-800">
                                                    {new Date(
                                                        config.nextScheduledScanAt
                                                    ).toLocaleString('tr-TR', {
                                                        weekday: 'long',
                                                        day: 'numeric',
                                                        month: 'long',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {config.enabled && config.clientCount === 0 && (
                                    <div className="flex items-center gap-2 text-amber-600">
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
                                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                            />
                                        </svg>
                                        <span className="text-sm">Aktif mükellef bulunamadı</span>
                                    </div>
                                )}

                                {!config.enabled && (
                                    <p className="text-sm text-gray-500">
                                        Zamanlamayı aktif ederek taramanın belirttiğiniz saatte
                                        tamamlanmasını sağlayabilirsiniz.
                                    </p>
                                )}
                            </div>

                            {/* Last Scan Info */}
                            {config.lastScheduledScanAt && (
                                <div className="bg-white rounded-lg p-4 border border-gray-100">
                                    <p className="text-xs text-gray-500 mb-1">Son Zamanlı Tarama</p>
                                    <p className="text-sm font-medium text-gray-700">
                                        {new Date(config.lastScheduledScanAt).toLocaleString(
                                            'tr-TR'
                                        )}
                                    </p>
                                </div>
                            )}

                            {/* How it works info */}
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                <div className="flex items-start gap-2">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    <div className="text-xs text-blue-700">
                                        <p className="font-semibold mb-1">Nasıl Çalışır?</p>
                                        <p>
                                            Sistem, mükellef sayısı ve tarama ayarlarınıza göre
                                            tahmini süreyi hesaplar ve tarama otomatik olarak
                                            belirlediğiniz saatte tamamlanacak şekilde erken
                                            başlatılır.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchedulePanel;
