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
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        fetchCredits();
        fetchSubscription();
    }, []);

    const fetchSubscription = async () => {
        try {
            const status = await window.electronAPI.getSubscriptionStatus();
            setSubscription(status);
        } catch (err) {
            console.error('Failed to fetch subscription:', err);
        }
    };

    const fetchCredits = async () => {
        try {
            const data = await window.electronAPI.getCredits();
            setCredits(data);
        } catch (err) {
            console.error('Failed to fetch credits:', err);
        }
    };

    const handleSyncCredits = async () => {
        setSyncing(true);
        try {
            await window.electronAPI.syncCredits();
            await fetchCredits();
        } catch (err) {
            console.error('Failed to sync credits:', err);
        } finally {
            setSyncing(false);
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
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const getPlanDisplayName = (plan: string | null) => {
        const plans: Record<string, string> = {
            free: 'Ücretsiz',
            basic: 'Temel',
            pro: 'Profesyonel',
            enterprise: 'Kurumsal',
        };
        return plan ? plans[plan] || plan : 'N/A';
    };

    const getStatusBadge = (isActive: boolean) => {
        return isActive ? (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">
                Aktif
            </span>
        ) : (
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-400">
                Pasif
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl md:text-4xl font-bold text-white">Hesap Ayarları</h1>

            {/* User Info */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Kullanıcı Bilgileri</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium">Görünen Ad</h3>
                        <p className="text-white text-lg">{currentUser?.displayName || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium">E-posta</h3>
                        <p className="text-white text-lg">{currentUser?.email}</p>
                    </div>
                    <div className="md:col-span-2">
                        <h3 className="text-slate-400 text-sm font-medium">Kullanıcı ID</h3>
                        <p className="text-white text-sm font-mono bg-slate-800 px-3 py-2 rounded mt-1">
                            {currentUser?.uid}
                        </p>
                    </div>
                </div>
            </Card>

            {/* Subscription Info */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Abonelik Durumu</h2>
                    {subscription && getStatusBadge(subscription.isActive)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium">Plan</h3>
                        <p className="text-white text-lg">{getPlanDisplayName(subscription?.plan || null)}</p>
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium">Bitiş Tarihi</h3>
                        <p className="text-white text-lg">{formatDate(subscription?.expiresAt || null)}</p>
                    </div>
                    <div>
                        <h3 className="text-slate-400 text-sm font-medium">Durum</h3>
                        <p className="text-white text-lg capitalize">{subscription?.status || 'N/A'}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button
                        onClick={() => handleOpenBilling()}
                        disabled={loading}
                        variant="primary"
                    >
                        Abonelik Yönetimi
                    </Button>
                    <Button
                        onClick={() => handleOpenBilling('pro')}
                        disabled={loading}
                        variant="secondary"
                    >
                        Plan Yükselt
                    </Button>
                </div>
            </Card>

            {/* Credits Info */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Kredi Durumu</h2>
                    <Button
                        onClick={handleSyncCredits}
                        disabled={syncing}
                        variant="ghost"
                        className="text-sm"
                    >
                        {syncing ? 'Senkronize ediliyor...' : 'Senkronize Et'}
                    </Button>
                </div>
                {credits ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-slate-800 rounded-lg p-4">
                                <h3 className="text-slate-400 text-sm font-medium">Toplam Kalan</h3>
                                <p className="text-2xl font-bold text-white">{credits.totalRemaining}</p>
                            </div>
                            <div className="bg-slate-800 rounded-lg p-4">
                                <h3 className="text-slate-400 text-sm font-medium">Aylık Kalan</h3>
                                <p className="text-2xl font-bold text-blue-400">
                                    {credits.monthlyRemaining}/{credits.monthlyLimit}
                                </p>
                            </div>
                            <div className="bg-slate-800 rounded-lg p-4">
                                <h3 className="text-slate-400 text-sm font-medium">Satın Alınan</h3>
                                <p className="text-2xl font-bold text-green-400">{credits.purchasedRemaining}</p>
                            </div>
                            <div className="bg-slate-800 rounded-lg p-4">
                                <h3 className="text-slate-400 text-sm font-medium">Bu Ay Kullanılan</h3>
                                <p className="text-2xl font-bold text-orange-400">{credits.monthlyUsed}</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-4">
                            <div className="flex justify-between text-sm text-slate-400 mb-1">
                                <span>Aylık Kullanım</span>
                                <span>{credits.monthlyUsed} / {credits.monthlyLimit}</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{
                                        width: `${Math.min((credits.monthlyUsed / credits.monthlyLimit) * 100, 100)}%`,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm text-slate-400 mb-4">
                            <span>Yenileme: {formatDate(credits.resetAt)}</span>
                            <span>Son Senkronizasyon: {credits.lastSyncAt ? new Date(credits.lastSyncAt).toLocaleString('tr-TR') : 'N/A'}</span>
                        </div>

                        <Button
                            onClick={() => handleOpenBilling('credit-1000')}
                            disabled={loading}
                            variant="primary"
                        >
                            Kredi Satın Al
                        </Button>
                    </>
                ) : (
                    <div className="text-slate-400">Kredi bilgileri yükleniyor...</div>
                )}
            </Card>

            {/* Logout */}
            <Card>
                <h2 className="text-xl font-semibold text-white mb-4">Oturum</h2>
                <p className="text-slate-400 mb-4">
                    Hesabınızdan çıkış yaparak tüm oturumlarınızı sonlandırabilirsiniz.
                </p>
                <Button
                    onClick={handleLogout}
                    disabled={loading}
                    variant="danger"
                >
                    {loading ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
                </Button>
            </Card>
        </div>
    );
};

export default Account;
