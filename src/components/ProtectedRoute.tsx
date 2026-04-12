import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Subscription } from '../types';

const ProtectedRoute: React.FC = () => {
    const { currentUser } = useAuth();
    const location = useLocation();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [loadingSub, setLoadingSub] = useState(true);
    const [subError, setSubError] = useState(false);

    useEffect(() => {
        if (!currentUser) {
            setLoadingSub(false);
            return;
        }

        let cancelled = false;
        const fetchStatus = async () => {
            try {
                const status = await window.electronAPI.getSubscriptionStatus();
                if (!cancelled) {
                    setSubscription(status);
                    setSubError(false);
                }
            } catch {
                // Network/IPC error — fail closed (redirect to subscription page)
                if (!cancelled) setSubError(true);
            } finally {
                if (!cancelled) setLoadingSub(false);
            }
        };

        fetchStatus();
        return () => {
            cancelled = true;
        };
    }, [currentUser]);

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // Show loading spinner while checking subscription
    if (loadingSub) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Y&uuml;kleniyor...</p>
                </div>
            </div>
        );
    }

    // Allow the subscription page itself so user can upgrade from there
    const isOnSubscriptionPage = location.pathname === '/subscription';
    const isOnAccountPage = location.pathname === '/account';

    // If subscription check failed OR subscription is inactive, redirect to subscription
    if (
        (subError || (subscription && !subscription.isActive)) &&
        !isOnSubscriptionPage &&
        !isOnAccountPage
    ) {
        return <Navigate to="/subscription" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
