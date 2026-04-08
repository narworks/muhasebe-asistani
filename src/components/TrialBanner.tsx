import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Subscription } from '../types';

const TrialBanner: React.FC = () => {
    const [subscription, setSubscription] = useState<Subscription | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchStatus = async () => {
            try {
                const status = await window.electronAPI.getSubscriptionStatus();
                if (!cancelled) setSubscription(status);
            } catch {
                // Silent — banner simply won't show
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 60_000); // refresh every minute
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    if (!subscription?.isTrial || !subscription.isActive) return null;

    const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    const daysLeft = trialEnd
        ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
        : 0;

    // Color scale by urgency
    const urgency =
        daysLeft <= 2
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : daysLeft <= 5
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300';

    return (
        <div
            className={`border-b px-4 py-2 text-sm flex items-center justify-between gap-3 ${urgency}`}
        >
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">🎁</span>
                <span className="truncate">
                    <strong>{daysLeft} gün</strong> ücretsiz deneme süreniz kaldı
                </span>
            </div>
            <Link
                to="/subscription"
                className="shrink-0 bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
                Abone Ol
            </Link>
        </div>
    );
};

export default TrialBanner;
