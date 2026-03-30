import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Skeleton, { StatGridSkeleton, CardSkeleton } from '../../components/ui/Skeleton';
import type { Tebligat, Client, Credits } from '../../types';

const STATS_KEY = 'toolUsageStats';

interface StatsData {
    statementConverter: number;
    eTebligat: number;
}

interface TebligatStats {
    total: number;
    unread: number;
    read: number;
    processed: number;
    byClient: Record<number, number>;
}

const ChartBarIcon = ({
    heightPercentage,
    colorClass = 'bg-sky-500',
}: {
    heightPercentage: number;
    colorClass?: string;
}) => (
    <div className="flex flex-col items-center justify-end h-48 w-16 bg-slate-700 rounded-t-lg">
        <div
            className={`w-full ${colorClass} rounded-t-lg transition-all duration-500`}
            style={{ height: `${Math.max(heightPercentage, 5)}%` }}
        ></div>
    </div>
);

const Statistics: React.FC = () => {
    const [stats, setStats] = useState<StatsData>({ statementConverter: 0, eTebligat: 0 });
    const [tebligatlar, setTebligatlar] = useState<Tebligat[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [credits, setCredits] = useState<Credits | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load local usage stats
            const savedStats = localStorage.getItem(STATS_KEY);
            if (savedStats) {
                setStats(JSON.parse(savedStats));
            }

            // Load real data from backend
            const [tebligatData, clientData, creditData] = await Promise.all([
                window.electronAPI.getTebligatlar(),
                window.electronAPI.getClients(),
                window.electronAPI.getCredits(),
            ]);

            setTebligatlar(tebligatData);
            setClients(clientData);
            setCredits(creditData);
        } catch (err) {
            console.error('Failed to load statistics:', err);
        } finally {
            setLoading(false);
        }
    };

    // Calculate tebligat statistics
    const tebligatStats: TebligatStats = tebligatlar.reduce(
        (acc, t) => {
            acc.total++;
            if (t.status === 'unread') acc.unread++;
            else if (t.status === 'read') acc.read++;
            else if (t.status === 'processed') acc.processed++;

            acc.byClient[t.client_id] = (acc.byClient[t.client_id] || 0) + 1;
            return acc;
        },
        { total: 0, unread: 0, read: 0, processed: 0, byClient: {} } as TebligatStats
    );

    const statementConverterUses = stats.statementConverter || 0;
    const eTebligatUses = stats.eTebligat || 0;
    const totalUses = statementConverterUses + eTebligatUses;

    // Calculate percentages for chart
    const maxVal = Math.max(statementConverterUses, eTebligatUses, 10);
    const statementConverterHeight = (statementConverterUses / maxVal) * 100;
    const eTebligatHeight = (eTebligatUses / maxVal) * 100;

    // Get recent tebligatlar (last 5)
    const recentTebligatlar = [...tebligatlar]
        .sort(
            (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        )
        .slice(0, 5);

    // Get top clients by tebligat count
    const topClients = Object.entries(tebligatStats.byClient)
        .map(([clientId, count]) => {
            const client = clients.find((c) => c.id === Number(clientId));
            return { clientId: Number(clientId), name: client?.firm_name || 'Bilinmeyen', count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0)
            return `Bugün, ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        if (days === 1)
            return `Dün, ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'unread':
                return 'text-red-400';
            case 'read':
                return 'text-yellow-400';
            case 'processed':
                return 'text-emerald-400';
            default:
                return 'text-slate-400';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'unread':
                return 'Okunmadı';
            case 'read':
                return 'Okundu';
            case 'processed':
                return 'İşlendi';
            default:
                return status;
        }
    };

    if (loading) {
        return (
            <div>
                <div className="mb-8">
                    <Skeleton variant="text" height="2.5rem" width="200px" className="mb-2" />
                    <Skeleton variant="text" height="1rem" width="300px" />
                </div>
                <StatGridSkeleton count={4} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <CardSkeleton className="h-72" />
                    <CardSkeleton className="h-72" />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">İstatistikler</h1>
                <p className="text-slate-400">Araç kullanım detaylarınız ve işlem geçmişiniz.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-sky-500 py-6">
                    <div className="bg-sky-500/10 p-3 rounded-full mb-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-sky-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">Toplam İşlem</h3>
                    <p className="text-3xl font-bold text-white">{totalUses}</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-emerald-500 py-6">
                    <div className="bg-emerald-500/10 p-3 rounded-full mb-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-emerald-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">Toplam Tebligat</h3>
                    <p className="text-3xl font-bold text-white">{tebligatStats.total}</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-orange-500 py-6">
                    <div className="bg-orange-500/10 p-3 rounded-full mb-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-orange-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">Aktif Mükellef</h3>
                    <p className="text-3xl font-bold text-white">
                        {clients.filter((c) => c.status === 'active').length}
                    </p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-purple-500 py-6">
                    <div className="bg-purple-500/10 p-3 rounded-full mb-3">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-purple-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">Kalan Kredi</h3>
                    <p className="text-3xl font-bold text-white">{credits?.totalRemaining || 0}</p>
                </Card>
            </div>

            {/* Tebligat Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-red-400">Okunmamış</p>
                            <p className="text-2xl font-bold text-red-400">
                                {tebligatStats.unread}
                            </p>
                        </div>
                        <div className="bg-red-500/20 p-3 rounded-full">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6 text-red-400"
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
                        </div>
                    </div>
                </Card>

                <Card className="bg-yellow-500/10 border border-yellow-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-yellow-400">Okunmuş</p>
                            <p className="text-2xl font-bold text-yellow-400">
                                {tebligatStats.read}
                            </p>
                        </div>
                        <div className="bg-yellow-500/20 p-3 rounded-full">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6 text-yellow-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                            </svg>
                        </div>
                    </div>
                </Card>

                <Card className="bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-emerald-400">İşlenmiş</p>
                            <p className="text-2xl font-bold text-emerald-400">
                                {tebligatStats.processed}
                            </p>
                        </div>
                        <div className="bg-emerald-500/20 p-3 rounded-full">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6 text-emerald-400"
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
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Tool Usage Chart */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-6">Araç Kullanım Dağılımı</h2>
                    <div className="flex justify-center gap-16 items-end h-64 pb-4 border-b border-slate-700/50">
                        <div className="flex flex-col items-center group w-24">
                            <ChartBarIcon
                                heightPercentage={statementConverterHeight}
                                colorClass="bg-indigo-500"
                            />
                            <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">
                                Ekstre
                            </p>
                            <p className="text-xs text-slate-500">{statementConverterUses} işlem</p>
                        </div>
                        <div className="flex flex-col items-center group w-24">
                            <ChartBarIcon
                                heightPercentage={eTebligatHeight}
                                colorClass="bg-emerald-500"
                            />
                            <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">
                                E-Tebligat
                            </p>
                            <p className="text-xs text-slate-500">{eTebligatUses} işlem</p>
                        </div>
                    </div>
                </Card>

                {/* Recent Tebligatlar */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">Son Tebligatlar</h2>
                    <div className="space-y-3">
                        {recentTebligatlar.length > 0 ? (
                            recentTebligatlar.map((t) => (
                                <div
                                    key={t.id}
                                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                                >
                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                        <div
                                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                t.status === 'unread'
                                                    ? 'bg-red-500'
                                                    : t.status === 'read'
                                                      ? 'bg-yellow-500'
                                                      : 'bg-emerald-500'
                                            }`}
                                        ></div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {t.firm_name || 'Bilinmeyen'}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">
                                                {t.subject || 'Konu belirtilmemiş'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                        <span
                                            className={`text-xs font-bold ${getStatusColor(t.status ?? '')}`}
                                        >
                                            {getStatusText(t.status ?? '')}
                                        </span>
                                        <p className="text-xs text-slate-500">
                                            {formatDate(t.created_at ?? '')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-slate-400 py-8">
                                Henüz tebligat bulunmuyor.
                            </div>
                        )}
                    </div>
                </Card>

                {/* Top Clients */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">
                        En Çok Tebligat Alan Mükellefler
                    </h2>
                    <div className="space-y-3">
                        {topClients.length > 0 ? (
                            topClients.map((client, index) => (
                                <div
                                    key={client.clientId}
                                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                                >
                                    <div className="flex items-center space-x-3">
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                index === 0
                                                    ? 'bg-yellow-500 text-yellow-900'
                                                    : index === 1
                                                      ? 'bg-slate-400 text-slate-900'
                                                      : index === 2
                                                        ? 'bg-orange-600 text-orange-100'
                                                        : 'bg-slate-600 text-slate-300'
                                            }`}
                                        >
                                            {index + 1}
                                        </span>
                                        <span className="text-white font-medium">
                                            {client.name}
                                        </span>
                                    </div>
                                    <span className="text-sky-400 font-bold">
                                        {client.count} tebligat
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-slate-400 py-8">
                                Henüz veri bulunmuyor.
                            </div>
                        )}
                    </div>
                </Card>

                {/* Credit Usage */}
                {credits && (
                    <Card>
                        <h2 className="text-xl font-bold text-white mb-4">Kredi Kullanımı</h2>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Aylık Kullanım</span>
                                    <span className="text-white">
                                        {credits.monthlyUsed} / {credits.monthlyLimit}
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-500"
                                        style={{
                                            width: `${Math.min((credits.monthlyUsed / credits.monthlyLimit) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-slate-800/50 rounded-lg p-3">
                                    <p className="text-xs text-slate-400">Aylık Kalan</p>
                                    <p className="text-xl font-bold text-blue-400">
                                        {credits.monthlyRemaining}
                                    </p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3">
                                    <p className="text-xs text-slate-400">Satın Alınan</p>
                                    <p className="text-xl font-bold text-green-400">
                                        {credits.purchasedRemaining}
                                    </p>
                                </div>
                            </div>

                            {credits.resetAt && (
                                <p className="text-xs text-slate-500 text-center">
                                    Aylık kredi yenileme:{' '}
                                    {new Date(credits.resetAt).toLocaleDateString('tr-TR', {
                                        day: 'numeric',
                                        month: 'long',
                                    })}
                                </p>
                            )}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default Statistics;
