import React from 'react';
import { FileText, Users, Coins } from 'lucide-react';

interface DashboardCardsProps {
    tebligatCount: number;
    newTebligatCount: number;
    clientCount: number;
    maxClients: number;
    creditBalance: number | null;
    onTabChange: (tab: string) => void;
}

const DashboardCards: React.FC<DashboardCardsProps> = ({
    tebligatCount,
    newTebligatCount,
    clientCount,
    maxClients,
    creditBalance,
    onTabChange,
}) => {
    const clientPercent = maxClients > 0 ? Math.min((clientCount / maxClients) * 100, 100) : 0;

    return (
        <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Tebligat */}
            <div
                className="bg-white border border-l-4 border-l-indigo-500 rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onTabChange('results')}
            >
                <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-sm font-semibold text-gray-500">Tebligat</span>
                </div>
                <div className="text-xl font-semibold text-gray-800">{tebligatCount}</div>
                {newTebligatCount > 0 && (
                    <div className="text-xs text-emerald-600 font-medium mt-0.5">
                        {newTebligatCount} yeni
                    </div>
                )}
            </div>

            {/* M&#252;kellef */}
            <div
                className="bg-white border border-l-4 border-l-emerald-500 rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onTabChange('clients')}
            >
                <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-sm font-semibold text-gray-500">M&uuml;kellef</span>
                </div>
                <div className="text-xl font-semibold text-gray-800">
                    {clientCount}
                    <span className="text-sm font-normal text-gray-400">/{maxClients}</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${
                            clientPercent >= 90
                                ? 'bg-red-500'
                                : clientPercent >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                        }`}
                        style={{ width: `${clientPercent}%` }}
                    />
                </div>
            </div>

            {/* Kredi */}
            <div className="bg-white border border-l-4 border-l-amber-500 rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-sm font-semibold text-gray-500">Kredi</span>
                </div>
                {creditBalance !== null ? (
                    <div
                        className={`text-xl font-semibold ${
                            creditBalance < 50 ? 'text-amber-600' : 'text-gray-800'
                        }`}
                    >
                        {creditBalance}
                    </div>
                ) : (
                    <div className="text-sm text-gray-400">&mdash;</div>
                )}
            </div>
        </div>
    );
};

export default DashboardCards;
