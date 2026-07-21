import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription } from '../../types';

/**
 * Katman 3 — Trial Expired Winback Modal (v1.9.15+).
 *
 * Trial süresi dolan kullanıcıya app açılışında bir kez gösterilir.
 * Kişisel istatistik özeti (X tarama, Y saat, Z mükellef) ile trial'da
 * yaşadığı değeri hatırlatır. İndirim / kupon YOK — gerçek kayıp bilinci.
 *
 * Trigger:
 *   - subscription.isTrial = true (trial'dan expired'a geçmiş)
 *   - subscription.status = 'expired' (cron çalışmış)
 *   - winback.shownAt = null
 */
const WinbackModal: React.FC = () => {
    const { state, isLoading, markWinbackShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [scanCount, setScanCount] = useState(0);
    const [clientCount, setClientCount] = useState(0);
    const [subLoading, setSubLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const [sub, history, clients] = await Promise.all([
                    window.electronAPI.getSubscriptionStatus(),
                    window.electronAPI.getScanHistory(500),
                    window.electronAPI.getClients(),
                ]);
                if (!mounted) return;
                setSubscription(sub);
                setScanCount(Array.isArray(history) ? history.length : 0);
                setClientCount(Array.isArray(clients) ? clients.length : 0);
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

    if (isLoading || subLoading || dismissed) return null;
    if (!subscription?.isTrial) return null;
    if (subscription.status !== 'expired') return null;
    if (state.winback.shownAt) return null;

    const hoursSaved = Math.max(1, Math.round((scanCount * 3) / 60));

    const handleDismiss = async () => {
        setDismissed(true);
        await markWinbackShown();
    };

    const handleGoToBilling = async () => {
        setDismissed(true);
        await markWinbackShown();
        await window.electronAPI.openBillingPortal();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[560px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="px-8 py-8">
                    <h2 className="text-2xl font-bold text-white mb-4">Deneme süreniz doldu.</h2>
                    <p className="text-slate-400 mb-3">Trial sırasında:</p>
                    <ul className="space-y-2 text-slate-200 mb-6">
                        <li>
                            •{' '}
                            <span className="text-emerald-400 font-semibold">
                                {scanCount} tarama
                            </span>{' '}
                            yaptınız
                        </li>
                        <li>
                            • Tahmini{' '}
                            <span className="text-emerald-400 font-semibold">
                                {hoursSaved} saat
                            </span>{' '}
                            tasarruf ettiniz
                        </li>
                        <li>
                            •{' '}
                            <span className="text-emerald-400 font-semibold">
                                {clientCount} mükellef
                            </span>{' '}
                            eklediniz
                        </li>
                    </ul>
                    <div className="bg-slate-700/40 rounded-lg p-4 mb-4">
                        <p className="text-white font-semibold mb-2">
                            Tam Paket ile devam edin: 6.000₺/yıl
                        </p>
                        <ul className="text-sm text-slate-300 space-y-1">
                            <li>• 200 mükellef limiti</li>
                            <li>• 5.000 kredi/ay</li>
                            <li>• Excel Asistanı + E-Tebligat Kontrol</li>
                        </ul>
                    </div>
                    <p className="text-sm text-slate-500">
                        Mükellef listeniz ve ayarlarınız korunur.
                    </p>
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleDismiss}
                        className="text-slate-400 hover:text-white text-sm px-3 py-1.5 transition-colors"
                    >
                        Şimdi Değil
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

export default WinbackModal;
