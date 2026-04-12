import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Navbar: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [subscription, setSubscription] = useState<{
        isActive: boolean;
        plan: string | null;
        status: string;
        modules?: string[];
    } | null>(null);
    const [credits, setCredits] = useState<{
        totalRemaining: number;
        monthlyLimit: number;
    } | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            if (currentUser?.uid) {
                try {
                    const data = await window.electronAPI.getSubscriptionStatus();
                    setSubscription(data);
                    const creditData = await window.electronAPI.getCredits();
                    setCredits(creditData);
                } catch (error) {
                    console.error('Error fetching subscription status:', error);
                }
            }
        };

        fetchStatus();
        const intervalId = setInterval(fetchStatus, 30000);

        const removeCreditsListener = window.electronAPI.onCreditsUpdated((updatedCredits) => {
            setCredits(updatedCredits);
        });

        return () => {
            clearInterval(intervalId);
            removeCreditsListener();
        };
    }, [currentUser]);

    const isLowCredits = credits && credits.totalRemaining < 500;

    return (
        <header className="h-14 bg-slate-900 flex items-center justify-end px-4 border-b border-slate-800">
            {subscription && (
                <button
                    onClick={() => navigate('/subscription')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        subscription.isActive
                            ? isLowCredits
                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                    }`}
                >
                    {subscription.isActive ? (
                        <>
                            <span className="text-emerald-400 text-xs font-semibold">PRO</span>
                            <span className="text-slate-500">|</span>
                            <span>
                                {credits?.totalRemaining.toLocaleString('tr-TR') ?? '\u2014'} kredi
                            </span>
                        </>
                    ) : (
                        <span>Abone Ol</span>
                    )}
                </button>
            )}
        </header>
    );
};

export default Navbar;
