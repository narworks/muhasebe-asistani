import React from 'react';
import Card from './ui/Card';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: { isActive: boolean; plan: string | null; status: string } | null;
    currentUserEmail: string;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, subscription, currentUserEmail }) => {
    if (!isOpen) return null;

    const openBilling = async () => {
        try {
            await window.electronAPI.openBillingPortal('plan-pro');
        } catch (error) {
            console.error('Billing portal could not be opened', error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md relative overflow-hidden">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
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

                    {/* Plan Card */}
                    <div>
                        <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">
                            {subscription?.isActive ? 'Mevcut Planınız' : 'Hemen Abone Olun'}
                        </h3>
                        <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="text-white font-bold text-lg">Muhasebe Asistanı Pro</p>
                                    <p className="text-slate-400 text-sm">Tüm araçlara sınırsız erişim</p>
                                </div>
                                <span className="bg-sky-500/20 text-sky-400 text-xs font-bold px-2 py-1 rounded-full">499 TL/Ay</span>
                            </div>
                            <ul className="text-sm text-slate-300 space-y-2 mb-4">
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>Banka Ekstresi Dönüştürücü - Sınırsız</span>
                                </li>
                                <li className="flex items-center space-x-2">
                                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    <span>E-Tebligat Otomasyonu - Sınırsız</span>
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
                                    Abone Ol
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
