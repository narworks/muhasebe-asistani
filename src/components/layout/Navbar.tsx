
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import SubscriptionModal from '../SubscriptionModal';

const Navbar: React.FC = () => {
    const { currentUser } = useAuth();
    const [subscription, setSubscription] = useState<{ isActive: boolean; plan: string | null; status: string } | null>(null);
    const [credits, setCredits] = useState<{ totalRemaining: number; monthlyLimit: number } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchStatus = async () => {
            if (currentUser?.uid) {
                try {
                    const data = await window.electronAPI.getSubscriptionStatus();
                    setSubscription(data);
                    const creditData = await window.electronAPI.getCredits();
                    setCredits(creditData);
                } catch (error) {
                    console.error("Error fetching subscription status:", error);
                }
            }
        };

        fetchStatus();
        const intervalId = setInterval(fetchStatus, 30000);

        // Listen for real-time credit updates
        window.electronAPI.onCreditsUpdated((updatedCredits) => {
            setCredits(updatedCredits);
        });

        return () => {
            clearInterval(intervalId);
            window.electronAPI.removeCreditsListeners();
        };
    }, [currentUser]);

    return (
        <>
            <header className="h-16 bg-slate-900 flex items-center justify-end px-6 border-b border-slate-700 space-x-4">
                {subscription?.isActive && credits && typeof credits.totalRemaining === 'number' && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                            credits.totalRemaining < 500
                                ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-400'
                                : 'bg-slate-500/10 border-slate-500/30 hover:border-slate-400'
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 ${credits.totalRemaining < 500 ? 'text-amber-400' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`text-xs font-bold ${credits.totalRemaining < 500 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {credits.totalRemaining.toLocaleString('tr-TR')} kredi
                        </span>
                    </button>
                )}
                {subscription && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border transition-all cursor-pointer group ${
                            subscription.isActive
                                ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400'
                                : 'bg-red-500/10 border-red-500/30 hover:border-red-400'
                        }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${subscription.isActive ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                        <span className={`text-xs font-bold uppercase tracking-wider ${
                            subscription.isActive ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                            {subscription.isActive ? 'Aktif Abonelik' : 'Abonelik Pasif'}
                        </span>
                    </button>
                )}
            </header>

            <SubscriptionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                subscription={subscription}
                currentUserEmail={currentUser?.email || ''}
            />
        </>
    );
};

export default Navbar;
