
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import SubscriptionModal from '../SubscriptionModal';

const Navbar: React.FC = () => {
    const { currentUser } = useAuth();
    const [subscription, setSubscription] = useState<{ isActive: boolean; plan: string | null; status: string } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchStatus = async () => {
            if (currentUser?.uid) {
                try {
                    const data = await window.electronAPI.getSubscriptionStatus();
                    setSubscription(data);
                } catch (error) {
                    console.error("Error fetching subscription status:", error);
                }
            }
        };

        fetchStatus();
        const intervalId = setInterval(fetchStatus, 30000);
        return () => clearInterval(intervalId);
    }, [currentUser]);

    return (
        <>
            <header className="h-16 bg-slate-900 flex items-center justify-end px-6 border-b border-slate-700 space-x-4">
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
