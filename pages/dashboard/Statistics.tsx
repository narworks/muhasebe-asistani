
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
    const [credits, setCredits] = useState<number | null>(null);

    useEffect(() => {
        // Load local usage stats
        const savedStats = localStorage.getItem(STATS_KEY);
        if (savedStats) {
            setStats(JSON.parse(savedStats));
        }

        // Fetch user credits
        const fetchCredits = async () => {
            if (currentUser?.uid) {
                try {
                    const res = await fetch(`http://localhost:3001/api/credits/${currentUser.uid}`);
                    const data = await res.json();
                    setCredits(data.balance);
                } catch (err) {
                    console.error("Kredi bilgisi alınamadı", err);
                }
            }
        };
        fetchCredits();
    }, [currentUser]);

    const statementConverterUses = stats.statementConverter || 0;
    const eTebligatUses = stats.eTebligat || 0; // Future proofing
    const totalUses = Object.values(stats).reduce((sum, count) => sum + count, 0);

    // Calculate percentages for chart (avoid division by zero)
    const maxVal = Math.max(statementConverterUses, eTebligatUses, 1);
    const statementConverterHeight = (statementConverterUses / maxVal) * 100;
    const eTebligatHeight = (eTebligatUses / maxVal) * 100;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">İstatistikler</h1>
                    <p className="text-slate-400">Kullanım detaylarınız ve kredi durumunuz.</p>
                </div>
                {credits !== null && (
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 text-right">
                        <p className="text-xs text-slate-400">Mevcut Kredi</p>
                        <p className={`text-3xl font-bold ${credits > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {credits}
                        </p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                <Card className="flex flex-col items-center justify-center text-center border-t-4 border-sky-500">
                    <h3 className="text-lg font-semibold text-slate-300 mb-2">Toplam İşlem</h3>
                    <p className="text-5xl font-bold text-white">{totalUses}</p>
                    <p className="text-slate-500 mt-1">kez araç kullanıldı</p>
                </Card>
                <Card className="flex flex-col items-center justify-center text-center border-t-4 border-indigo-500">
                    <h3 className="text-lg font-semibold text-slate-300 mb-2">Ekstre Dönüştürücü</h3>
                    <p className="text-5xl font-bold text-white">{statementConverterUses}</p>
                    <p className="text-slate-500 mt-1">dönüştürme</p>
                </Card>
                <Card className="flex flex-col items-center justify-center text-center border-t-4 border-emerald-500">
                    <h3 className="text-lg font-semibold text-slate-300 mb-2">E-Tebligat</h3>
                    <p className="text-5xl font-bold text-white">{eTebligatUses}</p>
                    <p className="text-slate-500 mt-1">sorgulama</p>
                </Card>
            </div>

            <Card>
                <h2 className="text-2xl font-bold text-white mb-6">Kullanım Dağılımı</h2>
                <div className="flex justify-center gap-16 items-end h-64 pb-4">
                    <div className="flex flex-col items-center group">
                        <ChartBarIcon heightPercentage={statementConverterHeight} colorClass="bg-indigo-500" />
                        <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors">Ekstre</p>
                    </div>
                    <div className="flex flex-col items-center group">
                        <ChartBarIcon heightPercentage={eTebligatHeight} colorClass="bg-emerald-500" />
                        <p className="mt-4 font-semibold text-slate-300 group-hover:text-white transition-colors">E-Tebligat</p>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Statistics;
