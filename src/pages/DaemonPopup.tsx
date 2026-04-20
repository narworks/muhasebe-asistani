import React, { useEffect, useState } from 'react';
import type { DaemonState, DaemonEvent } from '../types/electron';

interface RecentTebligat {
    id: number;
    firm_name: string;
    sender: string;
    subject: string;
    notification_date: string | null;
    send_date: string | null;
    created_at: string;
    status: string;
    client_id: number;
}

interface DaemonStats {
    todayScans: number;
    todayLimit: number;
    hourlyScans: number;
    hourlyLimit: number;
}

export default function DaemonPopup() {
    const [state, setState] = useState<DaemonState | null>(null);
    const [recent, setRecent] = useState<RecentTebligat[]>([]);
    const [stats, setStats] = useState<DaemonStats | null>(null);
    const [activeClient, setActiveClient] = useState<string | null>(null);
    const [todayCount, setTodayCount] = useState<number>(0);
    const [weeklyStats, setWeeklyStats] = useState<Array<{ date: string; count: number }>>([]);
    const [diskUsage, setDiskUsage] = useState<{
        totalMB: number | null;
        fileCount: number | null;
        freeDiskMB: number | null;
    }>({ totalMB: null, fileCount: null, freeDiskMB: null });

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [s, r, rl, d, today, weekly] = await Promise.all([
                    window.electronAPI.daemonGetState(),
                    window.electronAPI.getRecentTebligatlar(5),
                    window.electronAPI.getRateLimits(),
                    window.electronAPI.getDiskUsage(),
                    window.electronAPI.getTodayTebligatCount(),
                    window.electronAPI.getDailyTebligatStats(7),
                ]);
                setState(s);
                setRecent((r as RecentTebligat[]) || []);
                if (rl) {
                    setStats({
                        todayScans: (rl as { dailyUsed?: number }).dailyUsed || 0,
                        todayLimit: (rl as { dailyLimit?: number }).dailyLimit || 400,
                        hourlyScans: (rl as { hourlyUsed?: number }).hourlyUsed || 0,
                        hourlyLimit: (rl as { hourlyLimit?: number }).hourlyLimit || 200,
                    });
                }
                if (d) setDiskUsage(d);
                if (typeof today === 'number') setTodayCount(today);
                if (Array.isArray(weekly)) setWeeklyStats(weekly);
            } catch {
                /* ignore */
            }
        };
        fetchAll();
        const intv = setInterval(fetchAll, 3000);

        const unsub = window.electronAPI.onDaemonEvent((evt: DaemonEvent) => {
            setState(evt.state);
            if (evt.event === 'scan_start') {
                const name = evt.data?.firmName as string | undefined;
                setActiveClient(name || 'Taranıyor...');
            } else if (evt.event === 'scan_success' || evt.event === 'scan_failure') {
                setActiveClient(null);
                fetchAll();
            } else if (evt.event === 'new_tebligat') {
                fetchAll();
            }
        });

        return () => {
            clearInterval(intv);
            unsub();
        };
    }, []);

    const isActive = state?.running && !state?.paused;
    const nextTickIn =
        state?.nextTickAt && state.nextTickAt > Date.now() ? state.nextTickAt - Date.now() : 0;
    const nextTickLabel = formatDuration(nextTickIn);
    const dailyPercent = stats ? Math.round((stats.todayScans / stats.todayLimit) * 100) : 0;

    const handleToggle = async () => {
        if (state?.running) await window.electronAPI.daemonPause(60 * 60 * 1000);
        else await window.electronAPI.daemonStart();
    };

    const handleOpenMain = () => {
        window.electronAPI.openMainWindow();
    };

    return (
        <div className="w-full h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden select-none">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div
                        className={`w-2.5 h-2.5 rounded-full ${
                            isActive
                                ? 'bg-emerald-500 animate-pulse'
                                : state?.running
                                  ? 'bg-amber-500'
                                  : 'bg-gray-500'
                        }`}
                    />
                    <span className="text-sm font-medium">
                        {isActive
                            ? 'Arka Plan Tarama'
                            : state?.running && state?.paused
                              ? 'Duraklatıldı'
                              : 'Kapalı'}
                    </span>
                </div>
                <button
                    onClick={handleOpenMain}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                    Tam Panel →
                </button>
            </div>

            {/* Today's new tebligat banner */}
            <div className="px-4 pt-3">
                <div
                    className={`rounded-lg px-3 py-2 flex items-center justify-between ${
                        todayCount > 0
                            ? 'bg-gradient-to-r from-emerald-900/60 to-emerald-800/40 border border-emerald-700/50'
                            : 'bg-slate-800/60 border border-slate-700/50'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-base">{todayCount > 0 ? '📬' : '✓'}</span>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                Bugün gelen
                            </div>
                            <div
                                className={`text-base font-bold tabular-nums leading-tight ${
                                    todayCount > 0 ? 'text-emerald-300' : 'text-slate-300'
                                }`}
                            >
                                {todayCount} yeni tebligat
                            </div>
                        </div>
                    </div>
                    {todayCount === 0 && (
                        <span className="text-[10px] text-slate-500">Henüz yok</span>
                    )}
                </div>
            </div>

            {/* Daily progress */}
            {stats && (
                <div className="px-4 pt-3">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                        <span>Bugünkü tarama</span>
                        <span className="tabular-nums">
                            {stats.todayScans} / {stats.todayLimit}
                        </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full ${
                                dailyPercent >= 90
                                    ? 'bg-red-500'
                                    : dailyPercent >= 70
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                            } transition-all`}
                            style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Weekly sparkline */}
            {weeklyStats.length > 0 && (
                <div className="px-4 pt-3">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1.5">
                        <span>Son 7 gün</span>
                        <span className="tabular-nums">
                            {weeklyStats.reduce((s, d) => s + d.count, 0)} tebligat
                        </span>
                    </div>
                    <Sparkline data={weeklyStats} />
                </div>
            )}

            {/* Stats grid */}
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
                <MiniStat
                    label="Tarama"
                    value={state?.stats.totalScans.toString() || '0'}
                    hint="bu oturum"
                />
                <MiniStat
                    label="Yeni Tebligat"
                    value={state?.stats.newTebligatFound.toString() || '0'}
                    hint="bu oturum"
                    tone={
                        state?.stats.newTebligatFound && state.stats.newTebligatFound > 0
                            ? 'good'
                            : 'neutral'
                    }
                />
                <MiniStat
                    label="Şu an"
                    value={activeClient ? 'Taranıyor' : isActive ? 'Bekliyor' : '-'}
                    hint={activeClient || (isActive ? `${nextTickLabel} sonra` : '')}
                />
                <MiniStat
                    label="Hata"
                    value={state?.stats.failures.toString() || '0'}
                    tone={state?.stats.failures && state.stats.failures > 0 ? 'warn' : 'neutral'}
                />
            </div>

            {/* Recent tebligatlar */}
            <div className="flex-1 overflow-y-auto px-4">
                <div className="text-[11px] uppercase text-slate-500 mb-2 font-semibold tracking-wide">
                    Son Tebligatlar
                </div>
                {recent.length === 0 ? (
                    <div className="text-center text-sm text-slate-500 py-8">
                        Henüz yeni tebligat yok
                    </div>
                ) : (
                    <div className="space-y-1.5 pb-2">
                        {recent.map((t) => (
                            <div
                                key={t.id}
                                className="bg-slate-800 rounded-lg px-3 py-2 hover:bg-slate-750 cursor-pointer transition-colors"
                                onClick={handleOpenMain}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-slate-100 truncate">
                                            {t.firm_name || t.sender}
                                        </div>
                                        <div className="text-[11px] text-slate-400 truncate">
                                            {t.subject || t.sender}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                        {formatRelativeTime(
                                            t.notification_date || t.send_date || t.created_at
                                        )}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Disk usage row — detailed (3 columns: belgeler / dosya / boş) */}
            {diskUsage.totalMB !== null && (
                <div className="px-4 py-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-[10px]">
                    <div className="flex flex-col">
                        <span className="text-slate-500 uppercase tracking-wide">Belgeler</span>
                        <span
                            className={`font-semibold tabular-nums ${
                                diskUsage.totalMB > 10240
                                    ? 'text-red-400'
                                    : diskUsage.totalMB > 5120
                                      ? 'text-amber-400'
                                      : 'text-slate-200'
                            }`}
                        >
                            {formatMB(diskUsage.totalMB)}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-slate-500 uppercase tracking-wide">Dosya</span>
                        <span className="font-semibold tabular-nums text-slate-200">
                            {diskUsage.fileCount !== null
                                ? diskUsage.fileCount.toLocaleString('tr-TR')
                                : '—'}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-slate-500 uppercase tracking-wide">Boş alan</span>
                        <span
                            className={`font-semibold tabular-nums ${
                                diskUsage.freeDiskMB !== null && diskUsage.freeDiskMB < 1024
                                    ? 'text-red-400'
                                    : diskUsage.freeDiskMB !== null && diskUsage.freeDiskMB < 5120
                                      ? 'text-amber-400'
                                      : 'text-slate-200'
                            }`}
                        >
                            {diskUsage.freeDiskMB !== null ? formatMB(diskUsage.freeDiskMB) : '—'}
                        </span>
                    </div>
                </div>
            )}

            {/* Action bar */}
            <div className="px-4 py-3 border-t border-slate-800 flex gap-2">
                <button
                    onClick={handleToggle}
                    className={`flex-1 text-xs py-2 rounded font-medium ${
                        state?.running
                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                >
                    {state?.running ? '⏸ Duraklat' : '▶ Başlat'}
                </button>
                <button
                    onClick={handleOpenMain}
                    className="flex-1 text-xs py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium"
                >
                    📋 Aç
                </button>
            </div>
        </div>
    );
}

function MiniStat({
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
        tone === 'good'
            ? 'text-emerald-400'
            : tone === 'warn'
              ? 'text-amber-400'
              : 'text-slate-100';
    return (
        <div className="bg-slate-800 rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase text-slate-500 tracking-wide">{label}</div>
            <div className={`text-sm font-semibold mt-0.5 ${toneClass}`}>{value}</div>
            {hint && <div className="text-[10px] text-slate-500 truncate">{hint}</div>}
        </div>
    );
}

function Sparkline({ data }: { data: Array<{ date: string; count: number }> }) {
    const max = Math.max(1, ...data.map((d) => d.count));
    const dayLabels = ['Pa', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
    return (
        <div className="flex items-end gap-1 h-12">
            {data.map((d, i) => {
                const heightPct = (d.count / max) * 100;
                const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
                const isToday = i === data.length - 1;
                return (
                    <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-0.5 group"
                        title={`${d.date}: ${d.count} tebligat`}
                    >
                        <div className="flex-1 w-full flex items-end">
                            <div
                                className={`w-full rounded-t transition-all ${
                                    d.count === 0
                                        ? 'bg-slate-800'
                                        : isToday
                                          ? 'bg-emerald-500'
                                          : 'bg-indigo-500/70 group-hover:bg-indigo-400'
                                }`}
                                style={{
                                    height: d.count === 0 ? '2px' : `${Math.max(heightPct, 8)}%`,
                                }}
                            />
                        </div>
                        <span
                            className={`text-[9px] ${
                                isToday ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                            }`}
                        >
                            {dayLabels[dayOfWeek]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function formatMB(mb: number): string {
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDuration(ms: number): string {
    if (ms <= 0) return '—';
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `${mins} dk`;
    return `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
}

function formatRelativeTime(iso: string): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'şimdi';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} sa`;
    return `${Math.floor(diff / 86400000)} gün`;
}
