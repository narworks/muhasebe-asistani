import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription } from '../../types';

interface Props {
    /** İlk keşif taramasının süresi (ms) — metinde gösterim için (opsiyonel) */
    firstDiscoveryDurationMs?: number;
}

/**
 * Katman 2 — Aha Moment Prompt (v1.9.15+).
 *
 * İlk başarılı keşif taramasından 5 saniye sonra (kullanıcı sonucu izlerken)
 * bir kez gösterilir. Trial → Paid differential (10x mükellef, 10x kredi)
 * vurgusu ile heyecan anında planları görmeye davet eder.
 *
 * Trigger:
 *   - subscription.isTrial = true
 *   - onboarding.firstDiscoveryAt SET
 *   - onboarding.ahaPromptShownAt NULL (bir kez göster)
 *   - Component mount'undan 5sn sonra render
 */
const AhaMomentPrompt: React.FC<Props> = ({ firstDiscoveryDurationMs }) => {
    const { state, isLoading, markAhaPromptShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [showAfterDelay, setShowAfterDelay] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const sub = await window.electronAPI.getSubscriptionStatus();
                if (mounted) setSubscription(sub);
            } catch {
                /* silent */
            } finally {
                if (mounted) setSubLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setShowAfterDelay(true), 5000);
        return () => clearTimeout(t);
    }, []);

    if (isLoading || subLoading || dismissed || !showAfterDelay) return null;
    if (!subscription?.isTrial) return null;
    if (!state.onboarding.firstDiscoveryAt) return null;
    if (state.onboarding.ahaPromptShownAt) return null;

    const scanSeconds = firstDiscoveryDurationMs
        ? Math.max(1, Math.round(firstDiscoveryDurationMs / 1000))
        : null;

    const handleClose = async () => {
        setDismissed(true);
        await markAhaPromptShown();
    };

    const handleGoToPlans = async () => {
        setDismissed(true);
        await markAhaPromptShown();
        await window.electronAPI.openBillingPortal();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[480px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="px-6 py-6">
                    <h3 className="text-xl font-bold text-white mb-3">
                        🎉 İlk taraman{' '}
                        {scanSeconds !== null && (
                            <span className="text-emerald-400">{scanSeconds} saniyede</span>
                        )}{' '}
                        bitti!
                    </h3>
                    <div className="grid grid-cols-2 gap-4 my-5">
                        <div className="bg-slate-700/40 rounded-lg p-3">
                            <div className="text-xs text-slate-400 uppercase mb-2">
                                Trial&apos;da
                            </div>
                            <ul className="text-sm text-slate-200 space-y-1">
                                <li>• 20 mükellef</li>
                                <li>• 500 kredi/ay</li>
                                <li>• Tüm modüller</li>
                            </ul>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                            <div className="text-xs text-emerald-400 uppercase mb-2">
                                Aboneliğe geçince
                            </div>
                            <ul className="text-sm text-slate-200 space-y-1">
                                <li>• 200 mükellef (10 kat)</li>
                                <li>• 5.000 kredi/ay (10 kat)</li>
                                <li>• Aynı modüller</li>
                            </ul>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm">
                        Tam Paket: <span className="text-white font-semibold">6.000₺/yıl</span>
                    </p>
                </div>
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-white text-sm px-3 py-1.5"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleGoToPlans}
                        className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        Planları İncele →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AhaMomentPrompt;
