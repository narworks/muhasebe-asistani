/**
 * Subscription expiry banner — dashboard top'ta görünür.
 * 30 günden az kalınca aktif olur, severity'ye göre renk + mesaj değişir.
 * Dismiss edilebilir (info severity için 7 gün hatırla); critical/expired
 * dismiss edilemez (zorunlu görmesi gerek).
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExpiryStatus, getSeverityColors, getExpiryMessage } from '../lib/subscriptionUtils';
import type { Subscription } from '../types';

const DISMISS_KEY = 'subscription_banner_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

const SubscriptionBanner: React.FC = () => {
    const navigate = useNavigate();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchStatus = async () => {
            try {
                const status = await window.electronAPI.getSubscriptionStatus();
                if (!cancelled) setSubscription(status);
            } catch {
                /* sessizce geç — banner göstermez */
            }
        };

        fetchStatus();
        // 5 dakikada bir refresh — gün değişimi yansısın
        const id = setInterval(fetchStatus, 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
            const elapsed = Date.now() - parseInt(dismissedAt, 10);
            if (elapsed < DISMISS_TTL_MS) setDismissed(true);
        }
    }, []);

    const status = getExpiryStatus(subscription);

    if (!status.shouldShowBanner) return null;
    // Info severity dismissible — kritik durumda zorla göster
    if (dismissed && status.severity === 'info') return null;

    const colors = getSeverityColors(status.severity);
    const message = getExpiryMessage(status);
    const canDismiss = status.severity === 'info';

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        setDismissed(true);
    };

    const handleRenew = () => {
        navigate('/subscription');
    };

    const iconChar = (() => {
        switch (status.severity) {
            case 'expired':
                return '!';
            case 'critical':
                return '!';
            case 'warning':
                return '!';
            default:
                return 'i';
        }
    })();

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 border rounded-lg ${colors.bg} ${colors.border}`}
            role="alert"
        >
            <div
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold ${colors.icon} bg-current/10`}
            >
                <span className="text-current">{iconChar}</span>
            </div>
            <div className={`flex-1 ${colors.text}`}>
                <div className="font-medium text-sm">{message}</div>
                {status.severity !== 'info' && (
                    <div className="text-xs opacity-80 mt-0.5">
                        Hizmet kesintisiz devam etsin diye yenilemenizi öneririz.
                    </div>
                )}
            </div>
            <button
                onClick={handleRenew}
                className={`px-3 py-1.5 text-xs font-medium rounded ${colors.text} hover:bg-current/10 transition-colors border ${colors.border}`}
            >
                Yenile →
            </button>
            {canDismiss && (
                <button
                    onClick={handleDismiss}
                    className={`flex-shrink-0 w-6 h-6 rounded hover:bg-current/10 transition-colors ${colors.icon}`}
                    aria-label="Kapat"
                    title="7 gün gizle"
                >
                    ×
                </button>
            )}
        </div>
    );
};

export default SubscriptionBanner;
