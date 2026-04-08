import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Subscription } from '../types';

const ProtectedRoute: React.FC = () => {
    const { currentUser } = useAuth();
    const location = useLocation();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [loadingSub, setLoadingSub] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setLoadingSub(false);
            return;
        }

        let cancelled = false;
        const fetchStatus = async () => {
            try {
                const status = await window.electronAPI.getSubscriptionStatus();
                if (!cancelled) setSubscription(status);
            } catch {
                // Network/IPC error — fail open (let user in, features will error individually)
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

    // While loading subscription, render children (optimistic). The guards
    // inside individual feature pages already cover late-arriving expiry.
    if (loadingSub) {
        return <Outlet />;
    }

    // Allow the subscription page itself so user can upgrade from there
    const isOnSubscriptionPage = location.pathname === '/subscription';

    // If subscription is inactive/expired and user isn't on /subscription, redirect there
    if (subscription && !subscription.isActive && !isOnSubscriptionPage) {
        return <Navigate to="/subscription" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
