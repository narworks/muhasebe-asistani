import React, { useState, useEffect } from 'react';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: { isActive: boolean; plan: string | null; status: string } | null;
    currentUserEmail: string;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, subscription, currentUserEmail }) => {
    const [credits, setCredits] = useState<{
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
    } | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

    useEffect(() => {
        if (isOpen && subscription?.isActive) {
            window.electronAPI.getCredits().then(setCredits).catch(() => {});
        }
    }, [isOpen, subscription]);

    if (!isOpen) return null;

    const openBilling = async () => {
        try {
            const planId = billingPeriod === 'annual' ? 'plan-pro-annual' : 'plan-pro';
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md relative overflow-hidden max-h-[90vh] overflow-y-auto">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Header */}
                <div className="bg-slate-800 p-6 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white">Abonelik Durumu</h2>
                    <p className="text-slate-400 text-sm mt-1">{currentUserEmail}</p>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Current Status */}
                    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">Durum</p>
                            <p className={`text-xl font-bold ${subscription?.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                                {subscription?.isActive ? 'Aktif' : 'Pasif'}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-400 uppercase font-bold">Plan</p>
                            <p className="text-white font-semibold">
                                {subscription?.isActive ? 'Pro' : 'Abonelik Yok'}
                            </p>
                        </div>
                    </div>

                    {/* Credit Details (only for active subscriptions) */}
                    {subscription?.isActive && credits && (
                        <div>
                            <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Kredi Bakiyesi</h3>
                            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 space-y-4">
                                {/* Monthly Credits */}
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-400">Aylık Kredi</span>
                                        <span className="text-white font-semibold">
                                            {credits.monthlyRemaining.toLocaleString('tr-TR')} / {credits.monthlyLimit.toLocaleString('tr-TR')}
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-700 rounded-full h-2">
                                        <div
                                            className={`h-2 rounded-full transition-all duration-500 ${
                                                monthlyPercent > 80 ? 'bg-red-500' : monthlyPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${Math.min(100, monthlyPercent)}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Purchased Credits */}
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Ek Kredi</span>
                                    <span className="text-white font-semibold">{credits.purchasedRemaining.toLocaleString('tr-TR')}</span>
                                </div>

                                {/* Total */}
                                <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                                    <span className="text-slate-300 font-bold">Toplam Kalan</span>
                                    <span className={`font-bold ${credits.totalRemaining < 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {credits.totalRemaining.toLocaleString('tr-TR')} kredi
                                    </span>
                                </div>

                                {/* Reset Date */}
                                {credits.resetAt && (
                                    <p className="text-xs text-slate-500">
                                        Yenileme: {new Date(credits.resetAt).toLocaleDateString('tr-TR')}
                                    </p>
                                )}

                                {/* Purchase Button */}
                                <button
                                    onClick={purchaseCredits}
                                    className="w-full bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 font-semibold py-2.5 rounded-lg transition-colors text-sm border border-sky-500/30"
                                >
                                    Ek Kredi Satın Al (1.000 = 99 TL)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Plan Card */}
                    <div>
                        <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">
                            {subscription?.isActive ? 'Mevcut Planınız' : 'Hemen Abone Olun'}
                        </h3>

                        {/* Billing Period Toggle (only for non-subscribers) */}
                        {!subscription?.isActive && (
                            <div className="flex bg-slate-800 rounded-lg p-1 mb-4 border border-slate-700">
                                <button
                                    onClick={() => setBillingPeriod('monthly')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${
                                        billingPeriod === 'monthly'
                                            ? 'bg-sky-500 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Aylık
                                </button>
                                <button
                                    onClick={() => setBillingPeriod('annual')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all relative ${
                                        billingPeriod === 'annual'
                                            ? 'bg-sky-500 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Yıllık
                                    <span className="ml-1.5 text-[10px] font-bold text-emerald-400">%20 İndirim</span>
                                </button>
                            </div>
                        )}

                        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-white font-bold text-lg">Muhasebe Asistanı Pro</p>
                                    <p className="text-slate-400 text-sm">5.000 aylık kredi dahil</p>
                                </div>
                                {billingPeriod === 'monthly' ? (
                                    <span className="bg-sky-500/20 text-sky-400 text-xs font-bold px-2 py-1 rounded-full">499 TL/Ay</span>
                                ) : (
                                    <div className="text-right">
                                        <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded-full">399 TL/Ay</span>
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            <span className="line-through">5.988 TL</span> → 4.788 TL/Yıl
                                        </p>
                                    </div>
                                )}
                            </div>
                            <ul className="text-sm text-slate-300 space-y-2 mb-4">
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>Banka Ekstresi Dönüştürücü (5 kredi/işlem)</span>
                                </li>
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>E-Tebligat Otomasyonu (1 kredi/sorgu)</span>
                                </li>
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>Yapay Zeka Destekli İşlemler</span>
                                </li>
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>Öncelikli Destek</span>
                                </li>
                            </ul>
                            {!subscription?.isActive && (
                                <button
                                    onClick={openBilling}
                                    className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-lg transition-colors"
                                >
                                    {billingPeriod === 'annual' ? 'Yıllık Abone Ol' : 'Aylık Abone Ol'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-800 p-4 border-t border-slate-700 text-center">
                    <p className="text-xs text-slate-500">Ödemeler güvenli altyapı ile işlenmektedir.</p>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionModal;
