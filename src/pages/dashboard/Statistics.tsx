
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';

const STATS_KEY = 'toolUsageStats';

const ChartBarIcon = ({ heightPercentage, colorClass = "bg-sky-500" }: { heightPercentage: number, colorClass?: string }) => (
    <div className="flex flex-col items-center justify-end h-48 w-16 bg-slate-700 rounded-t-lg">
        <div
            className={`w-full ${colorClass} rounded-t-lg transition-all duration-500`}
            style={{ height: `${Math.max(heightPercentage, 5)}%` }}
        ></div>
    </div>
);

const Statistics: React.FC = () => {
    const { currentUser } = useAuth();
    const [stats, setStats] = useState<{ [key: string]: number }>({});

    useEffect(() => {
        // Load local usage stats
        const savedStats = localStorage.getItem(STATS_KEY);
        if (savedStats) {
            setStats(JSON.parse(savedStats));
        }
    }, []);

    const statementConverterUses = stats.statementConverter || 0;
    const eTebligatUses = stats.eTebligat || 0;
    const totalUses = Object.values(stats).reduce((sum, count) => sum + count, 0);

    // Calculate percentages for chart (avoid division by zero)
    const maxVal = Math.max(statementConverterUses, eTebligatUses, 10); // Minimum scale of 10
    const statementConverterHeight = (statementConverterUses / maxVal) * 100;
    const eTebligatHeight = (eTebligatUses / maxVal) * 100;

    return (
        <div>
            <div className="mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">İstatistikler</h1>
                <p className="text-slate-400">Araç kullanım detaylarınız ve işlem geçmişiniz.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-sky-500 py-8">
                    <div className="bg-sky-500/10 p-4 rounded-full mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-1">Toplam İşlem</h3>
                    <p className="text-4xl font-bold text-white">{totalUses}</p>
                    <p className="text-xs text-slate-500 mt-2">Tüm zamanlar</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-indigo-500 py-8">
                    <div className="bg-indigo-500/10 p-4 rounded-full mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-1">Ekstre Dönüştürme</h3>
                    <p className="text-4xl font-bold text-white">{statementConverterUses}</p>
                    <p className="text-xs text-slate-500 mt-2">Başarılı işlem</p>
                </Card>

                <Card className="flex flex-col items-center justify-center text-center border-l-4 border-emerald-500 py-8">
                    <div className="bg-emerald-500/10 p-4 rounded-full mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-1">E-Tebligat</h3>
                    <p className="text-4xl font-bold text-white">{eTebligatUses}</p>
                    <p className="text-xs text-slate-500 mt-2">Sorgulama</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <h2 className="text-xl font-bold text-white mb-6">Araç Kullanım Dağılımı</h2>
                    <div className="flex justify-center gap-16 items-end h-64 pb-4 border-b border-slate-700/50">
                        <div className="flex flex-col items-center group w-24">
                            <ChartBarIcon heightPercentage={statementConverterHeight} colorClass="bg-indigo-500" />
                            <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">Ekstre</p>
                            <p className="text-xs text-slate-500">{statementConverterUses} işlem</p>
                        </div>
                        <div className="flex flex-col items-center group w-24">
                            <ChartBarIcon heightPercentage={eTebligatHeight} colorClass="bg-emerald-500" />
                            <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">E-Tebligat</p>
                            <p className="text-xs text-slate-500">{eTebligatUses} işlem</p>
                        </div>
                    </div>
                </Card>

                <Card>
                    <h2 className="text-xl font-bold text-white mb-4">Son İşlemler</h2>
                    <div className="space-y-4">
                        {/* Mock Data for now, can be replaced with real logs later */}
                        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                                <div>
                                    <p className="text-sm font-medium text-white">Ekstre Dönüştürme</p>
                                    <p className="text-xs text-slate-500">Bugün, 14:30</p>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-emerald-400">Başarılı</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <div>
                                    <p className="text-sm font-medium text-white">E-Tebligat Sorgulama</p>
                                    <p className="text-xs text-slate-500">Dün, 09:15</p>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-emerald-400">Başarılı</span>
                        </div>
                        <div className="text-center pt-2">
                            <button className="text-xs text-sky-400 hover:text-sky-300 transition-colors">Tüm geçmişi görüntüle</button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Statistics;
