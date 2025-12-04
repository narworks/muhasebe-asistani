import React from 'react';
import Card from './ui/Card';

interface CreditModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentCredits: number;
    currentUserEmail: string | undefined;
}

const CreditModal: React.FC<CreditModalProps> = ({ isOpen, onClose, currentCredits, currentUserEmail }) => {
    if (!isOpen) return null;

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
                    <h2 className="text-xl font-bold text-white">Hesap Özeti</h2>
                    <p className="text-slate-400 text-sm mt-1">{currentUserEmail}</p>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Current Status */}
                    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-400 uppercase font-bold">Mevcut Kredi</p>
                            <p className="text-3xl font-bold text-emerald-400 font-mono">{currentCredits}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-400 uppercase font-bold">Paket</p>
                            <p className="text-white font-semibold">Başlangıç (Freelance)</p>
                        </div>
                    </div>

                    {/* Upgrade / Buy Options */}
                    <div>
                        <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">Kredi Yükle / Paket Yükselt</h3>
                        <div className="space-y-3">
                            <button className="w-full flex justify-between items-center bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-sky-500 p-3 rounded-lg transition-all group">
                                <div className="text-left">
                                    <p className="text-white font-bold group-hover:text-sky-400 transition-colors">100 Kredi Ekle</p>
                                    <p className="text-xs text-slate-400">Tek seferlik alım</p>
                                </div>
                                <span className="bg-slate-700 text-white text-sm font-bold px-3 py-1 rounded group-hover:bg-sky-500 transition-colors">150 TL</span>
                            </button>

                            <button className="w-full flex justify-between items-center bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-sky-500 p-3 rounded-lg transition-all group">
                                <div className="text-left">
                                    <p className="text-white font-bold group-hover:text-sky-400 transition-colors">Profesyonel Paket'e Geç</p>
                                    <p className="text-xs text-slate-400">Aylık 500 Kredi</p>
                                </div>
                                <span className="bg-slate-700 text-white text-sm font-bold px-3 py-1 rounded group-hover:bg-sky-500 transition-colors">499 TL/Ay</span>
                            </button>
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

export default CreditModal;
