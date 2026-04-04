import { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import type { Credits, Subscription } from '../../types';

const Account: React.FC = () => {
    const { currentUser, logout } = useAuth();
    const [credits, setCredits] = useState<Credits | null>(null);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [status, creditData] = await Promise.all([
                window.electronAPI.getSubscriptionStatus(),
                window.electronAPI.getCredits(),
            ]);
            setSubscription(status);
            setCredits(creditData);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        }
    };

    const handleOpenBilling = async (packageId?: string) => {
        setLoading(true);
        try {
            await window.electronAPI.openBillingPortal(packageId);
        } catch (err) {
            console.error('Failed to open billing:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        try {
            await logout();
        } catch (err) {
            console.error('Logout failed:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const usagePercent = credits
        ? Math.round((credits.monthlyUsed / credits.monthlyLimit) * 100)
        : 0;

    return (
        <div className="space-y-4 max-w-2xl">
            <h1 className="text-2xl font-bold text-white">Hesap</h1>

            {/* User Info */}
            <Card className="p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white font-medium">
                            {currentUser?.displayName || currentUser?.email}
                        </p>
                        <p className="text-slate-400 text-sm">{currentUser?.email}</p>
                    </div>
                    <Button
                        onClick={handleLogout}
                        disabled={loading}
                        variant="ghost"
                        className="text-sm"
                    >
                        Çıkış Yap
                    </Button>
                </div>
            </Card>

            {/* Subscription & Credits */}
            <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">Abonelik</h2>
                    {subscription && (
                        <div className="flex items-center gap-1.5">
                            {subscription.isActive &&
                                !subscription.isTrial &&
                                subscription.modules?.map((m) => (
                                    <span
                                        key={m}
                                        className={`px-2 py-0.5 text-xs font-medium rounded ${
                                            m === 'e_tebligat'
                                                ? 'bg-sky-500/20 text-sky-400'
                                                : 'bg-indigo-500/20 text-indigo-400'
                                        }`}
                                    >
                                        {m === 'e_tebligat' ? 'Tebligat' : 'Excel'}
                                    </span>
                                ))}
                            <span
                                className={`px-2 py-0.5 text-xs font-medium rounded ${
                                    subscription.isActive
                                        ? subscription.isTrial
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-red-500/20 text-red-400'
                                }`}
                            >
                                {subscription.isActive
                                    ? subscription.isTrial
                                        ? 'Deneme'
                                        : 'Aktif'
                                    : 'Pasif'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Trial Banner */}
                {subscription?.isTrial && subscription.trialEndsAt && (
                    <div
                        className={`rounded-lg p-3 text-sm ${
                            subscription.isActive
                                ? 'bg-amber-500/10 border border-amber-500/20'
                                : 'bg-red-500/10 border border-red-500/20'
                        }`}
                    >
                        {subscription.isActive ? (
                            <p className="text-amber-300">
                                14 g&uuml;nl&uuml;k &uuml;cretsiz deneme aktif &mdash;{' '}
                                <strong>
                                    {Math.max(
                                        0,
                                        Math.ceil(
                                            (new Date(subscription.trialEndsAt).getTime() -
                                                Date.now()) /
                                                (1000 * 60 * 60 * 24)
                                        )
                                    )}{' '}
                                    g&uuml;n kald&#305;
                                </strong>
                            </p>
                        ) : (
                            <div>
                                <p className="text-red-300 font-medium">
                                    Deneme s&uuml;reniz doldu.
                                </p>
                                <p className="text-red-400/70 text-xs mt-1">
                                    &Ouml;zellikleri kullanmaya devam etmek i&ccedil;in abone olun.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {subscription?.isActive && credits && (
                    <>
                        {/* Credit Progress */}
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-400">Aylık Kredi</span>
                                <span className="text-white">
                                    {credits.monthlyRemaining.toLocaleString('tr-TR')} /{' '}
                                    {credits.monthlyLimit.toLocaleString('tr-TR')}
                                </span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        usagePercent > 80
                                            ? 'bg-red-500'
                                            : usagePercent > 60
                                              ? 'bg-amber-500'
                                              : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${100 - usagePercent}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="flex justify-between text-sm">
                            <div>
                                <span className="text-slate-400">Ek Kredi: </span>
                                <span className="text-white">
                                    {credits.purchasedRemaining.toLocaleString('tr-TR')}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-400">Toplam: </span>
                                <span
                                    className={`font-medium ${
                                        credits.totalRemaining < 500
                                            ? 'text-amber-400'
                                            : 'text-emerald-400'
                                    }`}
                                >
                                    {credits.totalRemaining.toLocaleString('tr-TR')}
                                </span>
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>Yenileme: {formatDate(credits.resetAt)}</span>
                            <span>Bitiş: {formatDate(subscription.expiresAt)}</span>
                        </div>
                    </>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-slate-700">
                    {subscription?.isActive ? (
                        <>
                            <Button
                                onClick={() => handleOpenBilling('credit-1000')}
                                disabled={loading}
                                variant="secondary"
                                className="flex-1 text-sm"
                            >
                                Kredi Satın Al
                            </Button>
                            <Button
                                onClick={() => handleOpenBilling()}
                                disabled={loading}
                                variant="primary"
                                className="flex-1 text-sm"
                            >
                                Yönetim
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={() => handleOpenBilling('plan-pro')}
                            disabled={loading}
                            variant="primary"
                            className="flex-1"
                        >
                            Abone Ol
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default Account;
