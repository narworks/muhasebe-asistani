
import React, 'react';
import Card from '../../components/ui/Card';

const STATS_KEY = 'toolUsageStats';

const ChartBarIcon = ({ heightPercentage }: { heightPercentage: number }) => (
    <div className="flex flex-col items-center justify-end h-48 w-16 bg-slate-700 rounded-t-lg">
        <div 
            className="w-full bg-sky-500 rounded-t-lg transition-all duration-500"
            style={{ height: `${heightPercentage}%` }}
        ></div>
    </div>
);

const Statistics: React.FC = () => {
    const [stats, setStats] = React.useState<{ [key: string]: number }>({});

    React.useEffect(() => {
        const savedStats = localStorage.getItem(STATS_KEY);
        if (savedStats) {
            setStats(JSON.parse(savedStats));
        }
    }, []);

    const statementConverterUses = stats.statementConverter || 0;
    // Diğer araçlar eklendiğinde buraya eklenebilir. Örn:
    // const invoiceReaderUses = stats.invoiceReader || 0;
    const totalUses = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    // Basit bir bar chart için yükseklik yüzdeleri
    const statementConverterHeight = totalUses > 0 ? (statementConverterUses / (statementConverterUses || 1)) * 100 : 0;


    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Kullanım İstatistikleri</h1>
            <p className="text-slate-400 mb-8">Araçların ne sıklıkla kullanıldığını buradan takip edebilirsiniz. Veriler tarayıcınızda saklanır.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <Card className="flex flex-col items-center justify-center text-center">
                     <h3 className="text-lg font-semibold text-slate-300 mb-2">Toplam Kullanım</h3>
                     <p className="text-5xl font-bold text-sky-400">{totalUses}</p>
                     <p className="text-slate-500 mt-1">toplam işlem</p>
                </Card>
                <Card className="flex flex-col items-center justify-center text-center">
                     <h3 className="text-lg font-semibold text-slate-300 mb-2">Ekstre Dönüştürücü</h3>
                     <p className="text-5xl font-bold text-white">{statementConverterUses}</p>
                     <p className="text-slate-500 mt-1">kez kullanıldı</p>
                </Card>
                 <Card className="flex flex-col items-center justify-center text-center opacity-50">
                     <h3 className="text-lg font-semibold text-slate-300 mb-2">Fatura Görüntüleyici</h3>
                     <p className="text-5xl font-bold text-white">0</p>
                     <p className="text-slate-500 mt-1">kez kullanıldı (Yakında)</p>
                </Card>
            </div>
            
            <div className="mt-12">
                <Card>
                    <h2 className="text-2xl font-bold text-white mb-6">Araç Kullanım Dağılımı</h2>
                     <div className="flex justify-around items-end">
                        <div className="flex flex-col items-center">
                            <ChartBarIcon heightPercentage={statementConverterHeight} />
                            <p className="mt-2 font-semibold text-slate-300">Ekstre Dönüştürücü</p>
                        </div>
                         <div className="flex flex-col items-center opacity-50">
                            <ChartBarIcon heightPercentage={0} />
                            <p className="mt-2 font-semibold text-slate-300">Fatura Görüntüleyici</p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Statistics;
