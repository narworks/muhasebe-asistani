import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription } from '../../types';

/**
 * Katman 1 — Trial Son 3 Gün Countdown Modal (v1.9.15+).
 *
 * Trial kullanıcısına son 3 günde app açılışında bir kez / 24h cooldown ile
 * gösterilir. Amaç: gerçek kayıp bilinci (indirim değil) ile aboneliğe
 * geçişi tetiklemek.
 *
 * Trigger:
 *   - subscription.isTrial = true
 *   - trialEndsAt - now < 3 gün
 *   - upgradeModal.lastShownAt null VEYA > 24h önce
 */
const TrialCountdownModal: React.FC = () => {
    const { state, isLoading, markUpgradeModalShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const sub = await window.electronAPI.getSubscriptionStatus();
                if (mounted) setSubscription(sub);
            } catch {
                /* silent — modal simply won't show */
            } finally {
                if (mounted) setSubLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    if (isLoading || subLoading || dismissed) return null;
    // WelcomeModal ile aynı anda görünmesini engelle — önce hoşgeldin akışı bitsin
    if (!state.onboarding.seenWelcomeAt) return null;
    if (!subscription?.isTrial || !subscription.isActive || !subscription.trialEndsAt) return null;

    const trialEnd = new Date(subscription.trialEndsAt).getTime();
    const now = Date.now();
    const msLeft = trialEnd - now;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

    if (daysLeft > 3 || daysLeft < 0) return null;

    const lastShown = state.upgradeModal.lastShownAt
        ? new Date(state.upgradeModal.lastShownAt).getTime()
        : 0;
    const hoursSinceLastShow = (now - lastShown) / (60 * 60 * 1000);
    if (lastShown && hoursSinceLastShow < 24) return null;

    const handleDismiss = async () => {
        setDismissed(true);
        await markUpgradeModalShown();
    };

    const handleGoToBilling = async () => {
        setDismissed(true);
        await markUpgradeModalShown();
        await window.electronAPI.openBillingPortal();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[560px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700">
                    <div className="text-amber-400 text-sm font-semibold">
                        ⏳ Deneme süresi bitiyor
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1"
                        aria-label="Kapat"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-8 py-8">
                    <h2 className="text-2xl font-bold text-white mb-3">
                        Deneme sürenizin bitmesine{' '}
                        <span className="text-amber-400">{daysLeft} gün</span>.
                    </h2>
                    <p className="text-slate-400 mb-5">Trial bittikten sonra:</p>
                    <ul className="space-y-2 text-slate-300 mb-6">
                        <li>• Mükellef listenize erişim durur</li>
                        <li>• Arka plan e-tebligat takibi kesilir</li>
                        <li>• Excel Asistanı ve E-Tebligat Kontrol devre dışı kalır</li>
                    </ul>
                    <p className="text-slate-400 leading-relaxed">
                        Kesintisiz devam için Tam Paket abonelik:{' '}
                        <span className="text-white font-semibold">6.000₺/yıl</span>
                        <br />
                        <span className="text-sm text-slate-500">
                            (Excel Asistanı + E-Tebligat Kontrol · 200 mükellef · 5.000 kredi/ay)
                        </span>
                    </p>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleDismiss}
                        className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        Daha Sonra
                    </button>
                    <button
                        onClick={handleGoToBilling}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:shadow-[0_4px_20px_rgba(56,189,248,0.4)] text-white rounded-lg font-semibold transition-all"
                    >
                        Aboneliğe Geç →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrialCountdownModal;
