import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Skeleton, { StatGridSkeleton, CardSkeleton } from '../../components/ui/Skeleton';
import type { Tebligat, Client, Credits } from '../../types';

const STATS_KEY = 'toolUsageStats';

interface StatsData {
    statementConverter: number;
    eTebligat: number;
}

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
            const savedStats = localStorage.getItem(STATS_KEY);
            if (savedStats) {
                setStats(JSON.parse(savedStats));
            }

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

    const statementConverterUses = stats.statementConverter || 0;
    const eTebligatUses = stats.eTebligat || 0;
    const totalUses = statementConverterUses + eTebligatUses;
    const activeClients = clients.filter((c) => c.status === 'active').length;

    if (loading) {
        return (
            <div className="p-6">
                <div className="mb-8">
                    <Skeleton variant="text" height="2.5rem" width="200px" className="mb-2" />
                    <Skeleton variant="text" height="1rem" width="300px" />
                </div>
                <StatGridSkeleton count={4} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                    <CardSkeleton className="h-48" />
                    <CardSkeleton className="h-48" />
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    &#304;statistikler
                </h1>
                <p className="text-slate-400">Kullan&#305;m bilgileriniz ve kredi durumunuz.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-sky-500 py-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">
                        Toplam &#304;&#351;lem
                    </h3>
                    <p className="text-3xl font-bold text-white">{totalUses}</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-indigo-500 py-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">
                        Excel Asistan&#305;
                    </h3>
                    <p className="text-3xl font-bold text-white">{statementConverterUses}</p>
                    <p className="text-xs text-slate-500 mt-1">d&ouml;n&uuml;&#351;t&uuml;rme</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-emerald-500 py-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">E-Tebligat</h3>
                    <p className="text-3xl font-bold text-white">{tebligatlar.length}</p>
                    <p className="text-xs text-slate-500 mt-1">tebligat</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-orange-500 py-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">
                        Aktif M&uuml;kellef
                    </h3>
                    <p className="text-3xl font-bold text-white">{activeClients}</p>
                    <p className="text-xs text-slate-500 mt-1">/ {clients.length} toplam</p>
                </Card>
            </div>

            {/* Credit Usage + Tool Usage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Credit Usage */}
                {credits && (
                    <Card>
                        <h2 className="text-xl font-bold text-white mb-4">
                            Kredi Kullan&#305;m&#305;
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Ayl&#305;k Kullan&#305;m</span>
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

                            <div className="grid grid-cols-3 gap-4 pt-2">
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400">Toplam Kalan</p>
                                    <p className="text-xl font-bold text-sky-400">
                                        {credits.totalRemaining}
                                    </p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400">Ayl&#305;k Kalan</p>
                                    <p className="text-xl font-bold text-blue-400">
                                        {credits.monthlyRemaining}
                                    </p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400">Sat&#305;n Al&#305;nan</p>
                                    <p className="text-xl font-bold text-green-400">
                                        {credits.purchasedRemaining}
                                    </p>
                                </div>
                            </div>

                            {credits.resetAt && (
                                <p className="text-xs text-slate-500 text-center">
                                    Ayl&#305;k kredi yenileme:{' '}
                                    {new Date(credits.resetAt).toLocaleDateString('tr-TR', {
                                        day: 'numeric',
                                        month: 'long',
                                    })}
                                </p>
                            )}
                        </div>
                    </Card>
                )}

                {/* Tool Usage Breakdown */}
                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">
                        Ara&ccedil; Kullan&#305;m Da&#287;&#305;l&#305;m&#305;
                    </h2>
                    <div className="space-y-4">
                        {/* Excel Asistanı */}
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-300">Excel Asistan&#305;</span>
                                <span className="text-indigo-400 font-medium">
                                    {statementConverterUses} i&#351;lem
                                </span>
                            </div>
                            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-500"
                                    style={{
                                        width: `${totalUses > 0 ? (statementConverterUses / totalUses) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* E-Tebligat */}
                        <div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-300">E-Tebligat Tarama</span>
                                <span className="text-emerald-400 font-medium">
                                    {eTebligatUses} i&#351;lem
                                </span>
                            </div>
                            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-500"
                                    style={{
                                        width: `${totalUses > 0 ? (eTebligatUses / totalUses) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="pt-4 border-t border-slate-700/50">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400">Toplam Tebligat</p>
                                    <p className="text-xl font-bold text-emerald-400">
                                        {tebligatlar.length}
                                    </p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400">Toplam M&uuml;kellef</p>
                                    <p className="text-xl font-bold text-orange-400">
                                        {clients.length}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Support Section */}
            <Card className="bg-gradient-to-r from-slate-800 to-slate-800/80 border border-slate-700">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="w-14 h-14 bg-sky-500/15 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-7 w-7 text-sky-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                            />
                        </svg>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-lg font-bold text-white mb-1">
                            Yard&#305;ma m&#305; ihtiyac&#305;n&#305;z var?
                        </h3>
                        <p className="text-sm text-slate-400">
                            Sorular&#305;n&#305;z, &ouml;nerileriniz veya
                            ya&#351;ad&#305;&#287;&#305;n&#305;z sorunlar i&ccedil;in destek
                            ekibimize ula&#351;&#305;n.
                        </p>
                    </div>
                    <a
                        href="mailto:destek@muhasebeasistani.com?subject=Destek%20Talebi%20-%20Muhasebe%20Asistan%C4%B1"
                        className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex-shrink-0"
                    >
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
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                        Destek Talebi G&ouml;nder
                    </a>
                </div>
            </Card>
        </div>
    );
};

export default Statistics;
