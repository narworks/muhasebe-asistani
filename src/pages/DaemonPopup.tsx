import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, ExternalLink, Inbox, Clock, Check } from 'lucide-react';
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
    document_path: string | null;
    app_viewed_at: string | null;
}

interface UnviewedCounts {
    todayNew: number;
    pending: number;
    total: number;
}

interface DaemonStats {
    todayScans: number;
    todayLimit: number;
    hourlyScans: number;
    hourlyLimit: number;
}

const PAGE_SIZE = 5;

export default function DaemonPopup() {
    const [state, setState] = useState<DaemonState | null>(null);
    const [recent, setRecent] = useState<RecentTebligat[]>([]);
    const [stats, setStats] = useState<DaemonStats | null>(null);
    const [activeClient, setActiveClient] = useState<string | null>(null);
    const [todayErrorCount, setTodayErrorCount] = useState<number>(0);
    const [unviewed, setUnviewed] = useState<UnviewedCounts>({
        todayNew: 0,
        pending: 0,
        total: 0,
    });
    const [lastScanTime, setLastScanTime] = useState<string | null>(null);
    const [weeklyStats, setWeeklyStats] = useState<Array<{ date: string; count: number }>>([]);
    const [page, setPage] = useState(1);
    const [hasNewSinceNav, setHasNewSinceNav] = useState(false);
    const [diskUsage, setDiskUsage] = useState<{
        totalMB: number | null;
        fileCount: number | null;
        freeDiskMB: number | null;
    }>({ totalMB: null, fileCount: null, freeDiskMB: null });

    const rootRef = useRef<HTMLDivElement>(null);
    const lastSentHeight = useRef<number>(0);

    useEffect(() => {
        const fetchAll = async (markNewBadge = false) => {
            try {
                const [s, r, rl, d, weekly, errs, uv, lst] = await Promise.all([
                    window.electronAPI.daemonGetState(),
                    window.electronAPI.getRecentTebligatlar(25),
                    window.electronAPI.getRateLimits(),
                    window.electronAPI.getDiskUsage(),
                    window.electronAPI.getDailyTebligatStats(7),
                    window.electronAPI.getTodayErrorCount(),
                    window.electronAPI.getUnviewedCounts(),
                    window.electronAPI.getLastScanTime(),
                ]);
                setState(s);
                setRecent((prev) => {
                    const next = (r as RecentTebligat[]) || [];
                    // Detect newly arrived tebligat (top item id changed and not on page 1)
                    if (markNewBadge && prev.length && next.length && prev[0]?.id !== next[0]?.id) {
                        setHasNewSinceNav(true);
                    }
                    return next;
                });
                if (rl) {
                    setStats({
                        todayScans: (rl as { dailyUsed?: number }).dailyUsed || 0,
                        todayLimit: (rl as { dailyLimit?: number }).dailyLimit || 400,
                        hourlyScans: (rl as { hourlyUsed?: number }).hourlyUsed || 0,
                        hourlyLimit: (rl as { hourlyLimit?: number }).hourlyLimit || 200,
                    });
                }
                if (d) setDiskUsage(d);
                if (typeof errs === 'number') setTodayErrorCount(errs);
                if (Array.isArray(weekly)) setWeeklyStats(weekly);
                if (uv && typeof uv === 'object') setUnviewed(uv as UnviewedCounts);
                if (lst && typeof lst === 'string') setLastScanTime(lst);
            } catch {
                /* ignore */
            }
        };
        fetchAll();
        const intv = setInterval(() => fetchAll(true), 3000);

        const unsub = window.electronAPI.onDaemonEvent((evt: DaemonEvent) => {
            setState(evt.state);
            if (evt.event === 'scan_start') {
                const name = evt.data?.firmName as string | undefined;
                setActiveClient(name || 'Taranıyor...');
            } else if (evt.event === 'scan_success' || evt.event === 'scan_failure') {
                setActiveClient(null);
                fetchAll(true);
            } else if (evt.event === 'new_tebligat') {
                fetchAll(true);
            }
        });

        return () => {
            clearInterval(intv);
            unsub();
        };
    }, []);

    // Dynamically resize the popup to match actual rendered content height. ResizeObserver
    // watches the root div — which flows naturally (no h-screen / flex-1) so its scrollHeight
    // reflects the real content size. This is more robust than hardcoded constants which
    // drifted whenever a section changed.
    useLayoutEffect(() => {
        if (!window.electronAPI?.resizeDaemonPopup || !rootRef.current) return;
        const el = rootRef.current;
        const sendResize = () => {
            const h = Math.ceil(el.scrollHeight);
            if (h <= 0) return;
            if (Math.abs(h - lastSentHeight.current) < 2) return;
            lastSentHeight.current = h;
            window.electronAPI.resizeDaemonPopup(h).catch(() => {
                /* non-fatal */
            });
        };
        sendResize();
        const observer = new ResizeObserver(sendResize);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Keyboard pagination (← →)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
            else if (e.key === 'ArrowRight') {
                const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
                setPage((p) => Math.min(totalPages, p + 1));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [recent.length]);

    // 1Hz ticker for the "Şu an" countdown — the 3s fetchAll poll only refreshes
    // state every 3s so a minute-level label would stutter. A 1s re-render of this
    // popup costs ~1ms; when popup is blur-hidden the work is invisible but still
    // negligible. Stored as Date.now() so formatters always see a consistent "now".
    const [nowTick, setNowTick] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const isActive = state?.running && !state?.paused;
    const nextTickIn =
        state?.nextTickAt && state.nextTickAt > nowTick ? state.nextTickAt - nowTick : 0;
    const nextTickLabel = formatCountdown(nextTickIn);
    // Progress bar percent for "Şu an" card — what fraction of the interval has
    // elapsed. Needs the span between lastTickAt and nextTickAt; fall back to the
    // default 2min when lastTickAt is missing (first tick after start). Clamped
    // so edge cases (overdue ticks, clock skew) don't produce <0 or >100.
    const DEFAULT_TICK_SPAN_MS = 2 * 60 * 1000;
    const tickSpan =
        state?.lastTickAt && state?.nextTickAt && state.nextTickAt > state.lastTickAt
            ? state.nextTickAt - state.lastTickAt
            : DEFAULT_TICK_SPAN_MS;
    const nextTickElapsedPercent = isActive
        ? Math.max(0, Math.min(100, ((tickSpan - nextTickIn) / tickSpan) * 100))
        : 0;
    const dailyPercent = stats ? Math.round((stats.todayScans / stats.todayLimit) * 100) : 0;

    const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageItems = recent.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // An item is "new" if it was inserted today (local midnight). Used to highlight
    // freshly arrived tebligat with a green accent so the user can spot them at a glance.
    const startOfToday = (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    })();
    // Badge for each item: 'new' = bugün tebliğ + viewed değil; 'pending' = eski + viewed
    // değil; null = muhasebeci zaten açmış.
    const getItemBadge = (t: RecentTebligat): 'new' | 'pending' | null => {
        if (t.app_viewed_at) return null;
        const d = parseAnyDate(t.notification_date || t.send_date || t.created_at);
        if (!d) return 'pending';
        return d.getTime() >= startOfToday ? 'new' : 'pending';
    };

    const goToPage = (p: number) => {
        const next = Math.min(totalPages, Math.max(1, p));
        setPage(next);
        if (next === 1) setHasNewSinceNav(false); // user saw the latest
    };

    const handleToggle = async () => {
        if (state?.running) await window.electronAPI.daemonPause(60 * 60 * 1000);
        else await window.electronAPI.daemonStart();
    };

    const handleOpenMain = (path?: string) => {
        window.electronAPI.openMainWindow(path);
    };

    const handleTebligatClick = async (t: RecentTebligat) => {
        // Mark as viewed immediately so banner/badge update on next tick.
        try {
            await window.electronAPI.markTebligatViewed(t.id);
        } catch {
            /* non-fatal */
        }
        // Try to open the local PDF directly. If it doesn't exist (not yet downloaded),
        // fall back to opening the main window deep-linked to this specific tebligat so
        // the user lands on the correct row instead of a generic page.
        if (t.document_path) {
            const result = await window.electronAPI.openDocument(t.document_path);
            if (result?.success) return;
        }
        handleOpenMain(`/tools/e-tebligat?tebligatId=${t.id}`);
    };

    const handleOpenClientPanel = (e: React.MouseEvent, clientId: number) => {
        e.stopPropagation();
        handleOpenMain(`/tools/e-tebligat?clientId=${clientId}`);
    };

    const handleMarkAllViewed = async () => {
        try {
            await window.electronAPI.markAllTebligatViewed();
        } catch {
            /* ignore */
        }
    };

    return (
        <div
            ref={rootRef}
            className="w-full bg-slate-900 text-slate-100 flex flex-col overflow-hidden select-none"
        >
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
                        title={
                            isActive
                                ? 'Aktif'
                                : state?.running && state?.paused
                                  ? 'Duraklatıldı'
                                  : 'Kapalı'
                        }
                    />
                    <span className="text-sm font-semibold">Muhasebe Asistanı</span>
                </div>
                <button
                    onClick={() => handleOpenMain()}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                    Tam Panel →
                </button>
            </div>

            {/* Hybrid status banner — clickable: jumps to page 1 */}
            <div className="px-4 pt-3">
                <button
                    type="button"
                    onClick={() => unviewed.total > 0 && goToPage(1)}
                    disabled={unviewed.total === 0}
                    className={`w-full text-left rounded-lg px-3 py-2 flex items-center justify-between transition-colors ${
                        unviewed.total > 0
                            ? 'bg-gradient-to-r from-emerald-900/60 to-emerald-800/40 border border-emerald-700/50 hover:from-emerald-800/70 hover:to-emerald-700/50 cursor-pointer'
                            : 'bg-slate-800/60 border border-slate-700/50 cursor-default'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span
                            className={
                                unviewed.total === 0
                                    ? 'text-slate-400'
                                    : unviewed.todayNew > 0
                                      ? 'text-emerald-300'
                                      : 'text-amber-300'
                            }
                            aria-hidden
                        >
                            {unviewed.total === 0 ? (
                                <Check className="w-4 h-4" />
                            ) : unviewed.todayNew > 0 ? (
                                <Inbox className="w-4 h-4" />
                            ) : (
                                <Clock className="w-4 h-4" />
                            )}
                        </span>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-400">
                                {unviewed.total === 0 ? 'Tümü güncel' : 'Durum'}
                            </div>
                            <div
                                className={`text-sm font-bold leading-tight ${
                                    unviewed.total > 0 ? 'text-emerald-300' : 'text-slate-300'
                                }`}
                            >
                                {unviewed.total === 0 ? (
                                    <span>İncelenecek tebligat yok</span>
                                ) : unviewed.todayNew > 0 && unviewed.pending > 0 ? (
                                    <span>
                                        <span className="tabular-nums">{unviewed.todayNew}</span>{' '}
                                        yeni +{' '}
                                        <span className="tabular-nums">{unviewed.pending}</span>{' '}
                                        bekleyen
                                    </span>
                                ) : unviewed.todayNew > 0 ? (
                                    <span>
                                        <span className="tabular-nums">{unviewed.todayNew}</span>{' '}
                                        yeni tebligat
                                    </span>
                                ) : (
                                    <span>
                                        <span className="tabular-nums">{unviewed.pending}</span>{' '}
                                        tebligat bekliyor
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    {unviewed.total > 0 ? (
                        <span className="text-[10px] text-emerald-400">Göster ↓</span>
                    ) : null}
                </button>
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

            {/* Stats grid — 4 kart: son tarama zamanı (daemon aktif göstergesi),
                yeni tebligat (viewed-aware, banner ile aynı), şu an, bugünkü hata */}
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
                <MiniStat
                    label="Son Tarama"
                    value={lastScanTime ? formatRelativeTime(lastScanTime) : '—'}
                    hint={lastScanTime ? 'önce' : 'henüz yok'}
                />
                <MiniStat
                    label="Yeni Tebligat"
                    value={unviewed.todayNew.toString()}
                    hint="bugün, okunmamış"
                    tone={unviewed.todayNew > 0 ? 'good' : 'neutral'}
                />
                <MiniStat
                    label="Şu an"
                    value={activeClient ? 'Taranıyor' : isActive ? 'Bekliyor' : '-'}
                    hint={activeClient || (isActive ? nextTickLabel : '')}
                    progress={isActive && !activeClient ? nextTickElapsedPercent : undefined}
                />
                <MiniStat
                    label="Hata"
                    value={todayErrorCount.toString()}
                    hint="bugün"
                    tone={todayErrorCount > 0 ? 'warn' : 'neutral'}
                />
            </div>

            {/* Recent tebligatlar — natural height since pagination limits to 5 items */}
            <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] uppercase text-slate-500 font-semibold tracking-wide">
                        Son Tebligatlar
                    </div>
                    {hasNewSinceNav && safePage > 1 && (
                        <button
                            onClick={() => goToPage(1)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                            title="Yeni gelenleri gör"
                        >
                            ↑ Yeni
                        </button>
                    )}
                </div>
                {recent.length === 0 ? (
                    <div className="text-center text-sm text-slate-500 py-8">
                        Henüz yeni tebligat yok
                    </div>
                ) : (
                    <div className="space-y-1.5 pb-2">
                        {pageItems.map((t) => {
                            const badge = getItemBadge(t);
                            const rowClass =
                                badge === 'new'
                                    ? 'bg-emerald-900/30 hover:bg-emerald-900/50 border-l-2 border-emerald-400'
                                    : badge === 'pending'
                                      ? 'bg-amber-900/20 hover:bg-amber-900/40 border-l-2 border-amber-500/70'
                                      : 'bg-slate-800 hover:bg-slate-750';
                            return (
                                <div
                                    key={t.id}
                                    className={`rounded-lg px-3 py-2 cursor-pointer transition-colors group ${rowClass}`}
                                    onClick={() => handleTebligatClick(t)}
                                    title={
                                        t.document_path
                                            ? 'Belgeyi aç (mükellef adına tıklarsan o mükellefin sayfasına gider)'
                                            : 'Belge henüz indirilmedi — uygulamayı aç'
                                    }
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {badge === 'new' && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/20 px-1 rounded">
                                                        Yeni
                                                    </span>
                                                )}
                                                {badge === 'pending' && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/20 px-1 rounded">
                                                        Bekleyen
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) =>
                                                        handleOpenClientPanel(e, t.client_id)
                                                    }
                                                    className="text-xs font-medium text-slate-100 truncate hover:text-indigo-300 hover:underline text-left"
                                                    title="Bu mükellefin tebligat sayfasına git"
                                                >
                                                    {t.firm_name || t.sender}
                                                </button>
                                            </div>
                                            <div className="text-[11px] text-slate-400 truncate">
                                                {t.subject || t.sender}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                                {formatRelativeTime(
                                                    t.notification_date ||
                                                        t.send_date ||
                                                        t.created_at
                                                )}
                                            </span>
                                            <span
                                                className={
                                                    t.document_path
                                                        ? 'text-emerald-400'
                                                        : 'text-slate-500'
                                                }
                                                title={
                                                    t.document_path
                                                        ? 'PDF indirildi — tıklayınca açılır'
                                                        : 'PDF henüz indirilmedi — tıklayınca uygulama açılır'
                                                }
                                                aria-hidden
                                            >
                                                {t.document_path ? (
                                                    <FileText className="w-3 h-3" />
                                                ) : (
                                                    <ExternalLink className="w-3 h-3" />
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination row — only when more than 1 page */}
            {totalPages > 1 && (
                <div className="px-4 py-1.5 border-t border-slate-800 flex items-center justify-between text-[11px]">
                    <button
                        onClick={() => goToPage(safePage - 1)}
                        disabled={safePage === 1}
                        className="px-2 py-1 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                        aria-label="Önceki sayfa"
                    >
                        ◀
                    </button>
                    <span className="text-slate-400 tabular-nums">
                        Sayfa <span className="text-slate-200 font-semibold">{safePage}</span> /{' '}
                        {totalPages}
                        <span className="text-slate-500 ml-1.5">({recent.length} tebligat)</span>
                    </span>
                    <button
                        onClick={() => goToPage(safePage + 1)}
                        disabled={safePage >= totalPages}
                        className="px-2 py-1 rounded text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                        aria-label="Sonraki sayfa"
                    >
                        ▶
                    </button>
                </div>
            )}

            {/* Action links row — always shown when there's data */}
            {recent.length > 0 && (
                <div className="px-4 py-1.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
                    <button
                        onClick={() => handleOpenMain('/tools/e-tebligat?filter=pending')}
                        className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                    >
                        Tümünü Gör →
                    </button>
                    {unviewed.total > 0 && (
                        <button
                            onClick={handleMarkAllViewed}
                            className="text-slate-400 hover:text-slate-200 hover:underline transition-colors"
                            title={`${unviewed.total} tebligatı okundu olarak işaretle`}
                        >
                            ✓ Tümünü Okundu İşaretle
                        </button>
                    )}
                </div>
            )}

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
                    onClick={() => handleOpenMain()}
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
    progress,
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: 'good' | 'warn' | 'neutral';
    // 0–100 — when provided, renders a thin horizontal progress bar at the
    // bottom of the card. Bar color shifts green→amber→red as the remaining
    // time shrinks (so the "Şu an" countdown visually screams approaching tick).
    progress?: number;
}) {
    const toneClass =
        tone === 'good'
            ? 'text-emerald-400'
            : tone === 'warn'
              ? 'text-amber-400'
              : 'text-slate-100';
    const remaining = progress != null ? 100 - progress : 0;
    const barColor =
        remaining <= 10 ? 'bg-red-500' : remaining <= 30 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
        <div className="bg-slate-800 rounded-lg px-3 py-2">
            <div className="text-[10px] uppercase text-slate-500 tracking-wide">{label}</div>
            <div className={`text-sm font-semibold mt-0.5 ${toneClass}`}>{value}</div>
            {hint && <div className="text-[10px] text-slate-500 truncate">{hint}</div>}
            {progress != null && (
                <div className="mt-1.5 h-1 bg-slate-900/60 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${barColor} transition-all duration-1000 ease-linear`}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                    />
                </div>
            )}
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

// Countdown for the "Şu an" card — shown until the next daemon tick fires.
// Returns the full user-facing string (including "sonra" suffix) so callers
// don't compose awkward phrases like "şimdi sonra" when the countdown hits zero.
// Format boundaries:
//   ≤0  → "şimdi"
//   <1m → "45 sn sonra"
//   ≥1m → "1 dk 45 sn sonra"
//   ≥1h → "1 sa 23 dk sonra"  (seconds are noise at this scale)
// Math.ceil on seconds so the first visible value after "2 dk" is "1 dk 59 sn"
// not "1 dk 60 sn" — feels like a real countdown, not a stuttered one.
function formatCountdown(ms: number): string {
    if (ms <= 0) return 'şimdi';
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec >= 3600) {
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        return `${hours} sa ${mins} dk sonra`;
    }
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins > 0) return `${mins} dk ${secs.toString().padStart(2, '0')} sn sonra`;
    return `${secs} sn sonra`;
}

function parseAnyDate(s: string | null | undefined): Date | null {
    if (!s) return null;
    // Try ISO first
    const iso = new Date(s);
    if (!Number.isNaN(iso.getTime())) return iso;
    // Fallback: DD.MM.YYYY or DD/MM/YYYY (optionally with HH:MM)
    const m = String(s).match(/^(\d{2})[./](\d{2})[./](\d{4})(?:[\sT](\d{1,2}):(\d{2}))?/);
    if (m) {
        return new Date(
            Number(m[3]),
            Number(m[2]) - 1,
            Number(m[1]),
            Number(m[4] || 0),
            Number(m[5] || 0)
        );
    }
    return null;
}

function formatRelativeTime(raw: string): string {
    const d = parseAnyDate(raw);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'şimdi';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} sa`;
    return `${Math.floor(diff / 86400000)} gün`;
}
