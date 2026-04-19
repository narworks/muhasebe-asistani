import React, { useEffect, useState, useRef } from 'react';
import type { DaemonState, DaemonEvent } from '../../../types/electron';

interface Props {
    onForceRescanAll?: () => void;
}

type DaemonSettings = {
    enabled?: boolean;
    intervalMs?: number;
    acOnly?: boolean;
    nightModeAggressive?: boolean;
    notifications?: boolean;
    autoLaunch?: boolean;
};

export default function DaemonStatusPanel({ onForceRescanAll }: Props) {
    const [state, setState] = useState<DaemonState | null>(null);
    const [currentScanningFirm, setCurrentScanningFirm] = useState<string | null>(null);
    const [recentActivity, setRecentActivity] = useState<
        Array<{ time: number; firmName?: string; event: string; data?: Record<string, unknown> }>
    >([]);
    const [showSettings, setShowSettings] = useState(false);
    const [daemonSettings, setDaemonSettings] = useState<DaemonSettings>({});
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const fetchState = async () => {
            try {
                const s = await window.electronAPI.daemonGetState();
                setState(s);
            } catch {
                /* ignore */
            }
        };
        fetchState();
        pollingRef.current = setInterval(fetchState, 5000);

        // Load daemon settings
        window.electronAPI.daemonGetSettings().then((s) => setDaemonSettings(s || {}));

        const unsubscribe = window.electronAPI.onDaemonEvent((evt: DaemonEvent) => {
            setState(evt.state);

            if (evt.event === 'scan_start') {
                // data includes clientId but no firm name; we could enrich here if needed
                setCurrentScanningFirm('Taranıyor...');
            } else if (evt.event === 'scan_success' || evt.event === 'scan_failure') {
                setCurrentScanningFirm(null);
            }

            // Add to recent activity (keep last 20)
            const firmName =
                (evt.data?.firmName as string) ||
                ((evt.data?.clientId as number) ? `Mükellef #${evt.data.clientId}` : undefined);
            setRecentActivity((prev) =>
                [{ time: Date.now(), firmName, event: evt.event, data: evt.data }, ...prev].slice(
                    0,
                    20
                )
            );
        });

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            unsubscribe();
        };
    }, []);

    if (!state) {
        return null;
    }

    const isActive = state.running && !state.paused;
    const nextTickIn = state.nextTickAt > Date.now() ? state.nextTickAt - Date.now() : 0;
    const nextTickMins = Math.ceil(nextTickIn / 60000);

    const handleToggle = async () => {
        if (state.running) {
            await window.electronAPI.daemonPause(60 * 60 * 1000); // 1h
        } else {
            await window.electronAPI.daemonStart();
        }
    };

    const handleResume = async () => {
        await window.electronAPI.daemonResume();
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div
                        className={`w-3 h-3 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : state.running ? 'bg-amber-500' : 'bg-gray-400'}`}
                    />
                    <h3 className="font-semibold text-gray-800">
                        {isActive
                            ? 'Arka Plan Tarama Aktif'
                            : state.running && state.paused
                              ? 'Duraklatıldı'
                              : 'Arka Plan Tarama Kapalı'}
                    </h3>
                </div>
                <div className="flex gap-2">
                    {state.paused && (
                        <button
                            onClick={handleResume}
                            className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                            Devam Et
                        </button>
                    )}
                    <button
                        onClick={handleToggle}
                        className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                        {state.running ? 'Duraklat (1 saat)' : 'Başlat'}
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        title="Ayarlar"
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                        ⚙
                    </button>
                </div>
            </div>

            {showSettings && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowSettings(false)}
                >
                    <div
                        className="bg-white text-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                            Arka Plan Tarama Ayarları
                        </h3>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between text-gray-700">
                                <span className="text-sm">Arka plan tarama aktif</span>
                                <input
                                    type="checkbox"
                                    checked={daemonSettings.enabled !== false}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            enabled: e.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between text-gray-700">
                                <span className="text-sm">Bilgisayar açılınca otomatik başlat</span>
                                <input
                                    type="checkbox"
                                    checked={daemonSettings.autoLaunch !== false}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            autoLaunch: e.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between text-gray-700">
                                <span className="text-sm">Bildirimler</span>
                                <input
                                    type="checkbox"
                                    checked={daemonSettings.notifications !== false}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            notifications: e.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between text-gray-700">
                                <span className="text-sm">Gece saatlerinde hızlı tara (02-06)</span>
                                <input
                                    type="checkbox"
                                    checked={daemonSettings.nightModeAggressive !== false}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            nightModeAggressive: e.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <label className="flex items-center justify-between text-gray-700">
                                <span className="text-sm">Sadece şarjda çalış (pil tasarrufu)</span>
                                <input
                                    type="checkbox"
                                    checked={daemonSettings.acOnly === true}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            acOnly: e.target.checked,
                                        })
                                    }
                                />
                            </label>
                            <div className="text-gray-700">
                                <div className="text-sm mb-1">Tarama sıklığı</div>
                                <select
                                    value={daemonSettings.intervalMs || 2 * 60 * 1000}
                                    onChange={(e) =>
                                        setDaemonSettings({
                                            ...daemonSettings,
                                            intervalMs: Number(e.target.value),
                                        })
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-gray-800"
                                >
                                    <option value={60 * 1000}>Hızlı (1 dakika)</option>
                                    <option value={2 * 60 * 1000}>Normal (2 dakika)</option>
                                    <option value={5 * 60 * 1000}>Yavaş (5 dakika)</option>
                                    <option value={10 * 60 * 1000}>Çok yavaş (10 dakika)</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => setShowSettings(false)}
                                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                                İptal
                            </button>
                            <button
                                onClick={async () => {
                                    await window.electronAPI.daemonUpdateSettings(daemonSettings);
                                    setShowSettings(false);
                                }}
                                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            >
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-4 gap-3 text-sm">
                <StatBox
                    label="Bu Oturum"
                    value={`${state.stats.successes}/${state.stats.totalScans}`}
                    hint="başarılı / toplam"
                />
                <StatBox
                    label="Yeni Tebligat"
                    value={state.stats.newTebligatFound.toString()}
                    tone={state.stats.newTebligatFound > 0 ? 'good' : 'neutral'}
                />
                <StatBox
                    label="Hata"
                    value={state.stats.failures.toString()}
                    tone={state.stats.failures > 0 ? 'warn' : 'neutral'}
                />
                <StatBox
                    label={state.running ? 'Sıradaki Tarama' : 'Durum'}
                    value={
                        state.paused
                            ? 'Durdu'
                            : state.running
                              ? currentScanningFirm || `${nextTickMins} dk sonra`
                              : '-'
                    }
                />
            </div>

            {recentActivity.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-2">Son aktivite</div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                        {recentActivity.slice(0, 5).map((a, i) => (
                            <div key={i} className="text-xs flex items-center gap-2 text-gray-600">
                                <span className="text-gray-400 tabular-nums">
                                    {new Date(a.time).toLocaleTimeString('tr-TR')}
                                </span>
                                <span>
                                    {a.event === 'new_tebligat' ? (
                                        <span className="text-emerald-600 font-medium">
                                            🔔 {a.firmName}: {(a.data?.count as number) || ''} yeni
                                            tebligat
                                        </span>
                                    ) : a.event === 'scan_success' ? (
                                        <span>✓ {a.firmName || 'Tarama'} tamamlandı</span>
                                    ) : a.event === 'scan_failure' ? (
                                        <span className="text-red-600">
                                            ✗ {a.firmName || 'Tarama'}:{' '}
                                            {a.data?.errorType as string}
                                        </span>
                                    ) : a.event === 'ip_blocked' ? (
                                        <span className="text-red-600 font-semibold">
                                            ⛔ GİB IP engeli — 24 saat duraklatıldı
                                        </span>
                                    ) : a.event === 'skipped' ? (
                                        <span className="text-amber-600">
                                            ⏸ Atlandı: {skipReasonLabel(a.data?.reason as string)}
                                        </span>
                                    ) : a.event === 'idle' ? (
                                        <span className="text-gray-500">
                                            💤 Sırada bekleyen mükellef yok (hepsi yakın zamanda
                                            tarandı)
                                        </span>
                                    ) : a.event === 'scan_start' ? (
                                        <span className="text-blue-600">🔍 Tarama başladı</span>
                                    ) : a.event === 'started' ? (
                                        <span className="text-emerald-600">
                                            ▶ Daemon başlatıldı
                                        </span>
                                    ) : a.event === 'stopped' ? (
                                        <span className="text-gray-500">■ Daemon durduruldu</span>
                                    ) : a.event === 'paused' ? (
                                        <span className="text-amber-600">⏸ Duraklatıldı</span>
                                    ) : a.event === 'resumed' ? (
                                        <span className="text-emerald-600">▶ Devam ediyor</span>
                                    ) : (
                                        <span>{a.event}</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {onForceRescanAll && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <button
                        onClick={onForceRescanAll}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                        Tüm mükellefleri şimdi tara (uzun sürer)
                    </button>
                </div>
            )}
        </div>
    );
}

function skipReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
        offline: 'İnternet bağlantısı yok',
        disk_full: 'Disk alanı az (<500 MB)',
        battery_ac_only_mode: 'Pil modunda (AC bağlı değil)',
        cpu_busy: 'İşlemci yoğun',
        low_memory: 'Bellek az (RAM <10%)',
    };
    return labels[reason] || reason || 'bilinmiyor';
}

function StatBox({
    label,
    value,
    hint,
    tone = 'neutral',
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: 'good' | 'warn' | 'neutral';
}) {
    const toneClass =
        tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-800';
    return (
        <div className="bg-gray-50 rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
            <div className={`text-sm font-semibold mt-0.5 ${toneClass}`}>{value}</div>
            {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
        </div>
    );
}
