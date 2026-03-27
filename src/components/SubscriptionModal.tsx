import React, { useState, useEffect } from 'react';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: { isActive: boolean; plan: string | null; status: string } | null;
    currentUserEmail: string;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, subscription }) => {
    const [credits, setCredits] = useState<{
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
    } | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');

    useEffect(() => {
        if (isOpen && subscription?.isActive) {
            window.electronAPI
                .getCredits()
                .then(setCredits)
                .catch(() => {});
        }
    }, [isOpen, subscription]);

    if (!isOpen) return null;

    const openBilling = async (period?: 'monthly' | 'annual') => {
        try {
            const selectedPeriod = period || billingPeriod;
            const planId = selectedPeriod === 'annual' ? 'plan-pro-annual' : 'plan-pro';
            await window.electronAPI.openBillingPortal(planId);
        } catch (error) {
            console.error('Billing portal could not be opened', error);
        }
    };

    const purchaseCredits = async () => {
        try {
            await window.electronAPI.purchaseCredits();
        } catch (error) {
            console.error('Credit purchase portal could not be opened', error);
        }
    };

    const monthlyPercent = credits
        ? Math.round((credits.monthlyUsed / credits.monthlyLimit) * 100)
        : 0;

    const remainingPercent = 100 - monthlyPercent;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-white">Abonelik</h2>
                        {subscription?.isActive && (
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                                Pro
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
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
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                {subscription?.isActive ? (
                    // Aktif Abone Görünümü
                    <>
                        <div className="p-4 space-y-3">
                            {/* Progress Bar */}
                            {credits && (
                                <>
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                                            <span>Aylık Kredi</span>
                                            <span className="text-white">
                                                {credits.monthlyRemaining.toLocaleString('tr-TR')} /{' '}
                                                {credits.monthlyLimit.toLocaleString('tr-TR')}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-slate-700 rounded-full">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    monthlyPercent > 80
                                                        ? 'bg-red-500'
                                                        : monthlyPercent > 60
                                                          ? 'bg-amber-500'
                                                          : 'bg-emerald-500'
                                                }`}
                                                style={{
                                                    width: `${Math.min(100, remainingPercent)}%`,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Ek Kredi */}
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Ek Kredi</span>
                                        <span className="text-white">
                                            {credits.purchasedRemaining.toLocaleString('tr-TR')}
                                        </span>
                                    </div>

                                    {/* Toplam */}
                                    <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                                        <span className="text-white font-medium">Toplam</span>
                                        <span
                                            className={`font-semibold ${
                                                credits.totalRemaining < 500
                                                    ? 'text-amber-400'
                                                    : 'text-emerald-400'
                                            }`}
                                        >
                                            {credits.totalRemaining.toLocaleString('tr-TR')} kredi
                                        </span>
                                    </div>

                                    {/* Yenileme Tarihi */}
                                    {credits.resetAt && (
                                        <p className="text-xs text-slate-500">
                                            Yenileme:{' '}
                                            {new Date(credits.resetAt).toLocaleDateString('tr-TR')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Aksiyon Butonları */}
                        <div className="flex gap-2 p-4 border-t border-slate-700">
                            <button
                                onClick={purchaseCredits}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                                Ek Kredi Al
                            </button>
                            <button
                                onClick={() => window.electronAPI.openBillingPortal()}
                                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                                Yönetim
                            </button>
                        </div>
                    </>
                ) : (
                    // Pasif Kullanıcı Görünümü
                    <div className="p-4">
                        <div className="text-center mb-4">
                            <h3 className="text-lg font-semibold text-white">Muhasebe Asistanı</h3>
                            <p className="text-slate-400 text-sm mt-1">5.000 aylık kredi dahil</p>
                        </div>

                        {/* Fiyat Seçenekleri */}
                        <div className="flex justify-center items-center gap-3 mb-4">
                            <button
                                onClick={() => setBillingPeriod('monthly')}
                                className={`text-sm px-3 py-1.5 rounded transition-colors ${
                                    billingPeriod === 'monthly'
                                        ? 'bg-slate-700 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                500₺/ay
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => setBillingPeriod('annual')}
                                className={`text-sm px-3 py-1.5 rounded transition-colors ${
                                    billingPeriod === 'annual'
                                        ? 'bg-slate-700 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                417₺/ay <span className="text-emerald-400 text-xs">(yıllık)</span>
                            </button>
                        </div>

                        {/* Abone Ol Butonu */}
                        <button
                            onClick={() => openBilling()}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                        >
                            Hemen Başla
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubscriptionModal;
