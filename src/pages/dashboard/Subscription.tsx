import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Subscription as SubType, Credits } from '../../types';

const MODULES: Record<
    string,
    {
        name: string;
        shortName: string;
        price: number;
        color: string;
        planId: string;
        features: string[];
    }
> = {
    excel_assistant: {
        name: 'Excel Asistanı',
        shortName: 'Excel',
        price: 2500,
        color: 'indigo',
        planId: 'plan-excel-annual',
        features: [
            'Excel, CSV, PDF dosyalarını dönüştürün',
            'Akıllı veri işleme ve özel şablonlar',
            'Sonuçları Excel olarak indirin',
        ],
    },
    e_tebligat: {
        name: 'E-Tebligat Kontrol',
        shortName: 'Tebligat',
        price: 5000,
        color: 'sky',
        planId: 'plan-etebligat-annual',
        features: [
            'Otomatik GİB e-tebligat tarama',
            'Döküman indirme ve arşivleme',
            'Çoklu mükellef yönetimi',
        ],
    },
};

const BUNDLE_PRICE = 6000;

type SelectedPlan = string | 'bundle' | null;

const Subscription: React.FC = () => {
    const { currentUser } = useAuth();
    const [subscription, setSubscription] = useState<SubType | null>(null);
    const [credits, setCredits] = useState<Credits | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>(null);
    const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
        null
    );

    const fetchData = async () => {
        try {
            const [sub, cred] = await Promise.all([
                window.electronAPI.getSubscriptionStatus(),
                window.electronAPI.getCredits(),
            ]);
            setSubscription(sub);
            setCredits(cred);
            setFormData((prev) => ({ ...prev, email: currentUser?.email || prev.email }));
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    useEffect(() => {
        const handler = () => fetchData();
        window.electronAPI.onCreditsUpdated(handler);
        return () => window.electronAPI.removeCreditsListeners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasModule = (id: string) => subscription?.isTrial || subscription?.modules?.includes(id);

    const getPrice = (plan: SelectedPlan): number => {
        if (!plan) return 0;
        if (plan === 'bundle') return BUNDLE_PRICE;
        return MODULES[plan]?.price || 0;
    };

    const getPlanId = (plan: SelectedPlan): string => {
        if (plan === 'bundle') return 'plan-bundle-annual';
        return MODULES[plan || '']?.planId || '';
    };

    const getPlanLabel = (plan: SelectedPlan): string => {
        if (plan === 'bundle') return 'Tam Paket';
        return MODULES[plan || '']?.name || '';
    };

    const handleCreditCard = async () => {
        if (!formData.name || !formData.email || !selectedPlan) return;
        try {
            await window.electronAPI.openCheckout({
                plan: getPlanId(selectedPlan),
                period: 'annual',
                email: formData.email,
                name: formData.name,
                phone: formData.phone,
            });
            setSelectedPlan(null);
        } catch {
            setMessage({ text: 'Ödeme başlatılamadı.', type: 'error' });
        }
    };

    const handleBankTransfer = async () => {
        if (!formData.name || !formData.email || !selectedPlan) return;
        setSubmitting(true);
        try {
            const res = await fetch('https://muhasebeasistani.com/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    plan: getPlanId(selectedPlan),
                    planLabel: getPlanLabel(selectedPlan),
                    price: getPrice(selectedPlan),
                    source: 'desktop_app',
                }),
            });
            if (res.ok) {
                setMessage({
                    text: 'Başvurunuz alındı! Banka bilgileri email adresinize gönderilecek.',
                    type: 'success',
                });
                setSelectedPlan(null);
            } else {
                setMessage({ text: 'Bir hata oluştu.', type: 'error' });
            }
        } catch {
            setMessage({ text: 'Bağlantı hatası.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center h-full">
                <div className="text-slate-400">Yükleniyor...</div>
            </div>
        );
    }

    const monthlyPercent = credits
        ? Math.round((credits.monthlyUsed / credits.monthlyLimit) * 100)
        : 0;

    const trialDaysLeft = subscription?.trialEndsAt
        ? Math.max(
              0,
              Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86400000)
          )
        : 0;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Abonelik Yönetimi</h1>
                <p className="text-slate-400 text-sm mt-1">
                    Modüllerinizi yönetin, kredi bakiyenizi takip edin.
                </p>
            </div>

            {/* Mesaj */}
            {message && (
                <div
                    className={`rounded-lg p-3 text-sm ${
                        message.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}
                >
                    {message.text}
                    <button onClick={() => setMessage(null)} className="ml-3 underline text-xs">
                        Kapat
                    </button>
                </div>
            )}

            {/* Trial Banner */}
            {subscription?.isTrial && subscription.isActive && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <p className="text-amber-400 font-medium">
                        14 günlük ücretsiz deneme aktif — <strong>{trialDaysLeft} gün kaldı</strong>
                    </p>
                    <p className="text-amber-400/70 text-xs mt-1">
                        Tüm modüller deneme süresince aktif. Devam etmek için abone olun.
                    </p>
                </div>
            )}

            {/* Kredi Bilgisi */}
            {credits && subscription?.isActive && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-white">Kredi Bakiyesi</h2>
                        <span
                            className={`text-lg font-bold ${
                                credits.totalRemaining < 500 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                        >
                            {credits.totalRemaining.toLocaleString('tr-TR')} kredi
                        </span>
                    </div>
                    <div className="space-y-2">
                        <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Aylık Kredi</span>
                                <span>
                                    {credits.monthlyRemaining.toLocaleString('tr-TR')} /{' '}
                                    {credits.monthlyLimit.toLocaleString('tr-TR')}
                                </span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        monthlyPercent > 80
                                            ? 'bg-red-500'
                                            : monthlyPercent > 60
                                              ? 'bg-amber-500'
                                              : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, 100 - monthlyPercent)}%` }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">Ek Kredi</span>
                            <span className="text-white">
                                {credits.purchasedRemaining.toLocaleString('tr-TR')}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modül Kartları */}
            <div>
                <h2 className="text-sm font-semibold text-white mb-3">Modüller</h2>

                {/* Tam Paket */}
                <button
                    type="button"
                    onClick={() => {
                        if (!hasModule('excel_assistant') || !hasModule('e_tebligat')) {
                            setSelectedPlan(selectedPlan === 'bundle' ? null : 'bundle');
                        }
                    }}
                    className={`w-full text-left rounded-xl p-5 border-2 mb-3 transition-all ${
                        hasModule('excel_assistant') &&
                        hasModule('e_tebligat') &&
                        !subscription?.isTrial
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : selectedPlan === 'bundle'
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                TÜM MODÜLLER
                            </span>
                            {hasModule('excel_assistant') &&
                                hasModule('e_tebligat') &&
                                !subscription?.isTrial && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                        AKTİF
                                    </span>
                                )}
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-white">6.000₺</span>
                            <span className="text-slate-400 text-sm">/yıl</span>
                            <span className="text-sm text-slate-500 line-through ml-1">7.500₺</span>
                        </div>
                    </div>
                    <p className="text-sm font-semibold text-white mt-2">Tam Paket</p>
                    <p className="text-xs text-emerald-400">1.500₺ tasarruf • 5.000 aylık kredi</p>
                </button>

                <div className="grid grid-cols-2 gap-3">
                    {Object.entries(MODULES).map(([id, mod]) => {
                        const isActive = hasModule(id) && !subscription?.isTrial;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    if (!isActive) setSelectedPlan(selectedPlan === id ? null : id);
                                }}
                                className={`text-left rounded-xl p-4 border-2 transition-all ${
                                    isActive
                                        ? `border-${mod.color}-500/30 bg-${mod.color}-500/5`
                                        : selectedPlan === id
                                          ? `border-${mod.color}-500 bg-${mod.color}-500/10`
                                          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span
                                        className={`text-xs font-semibold px-2 py-0.5 rounded bg-${mod.color}-500/20 text-${mod.color}-400`}
                                    >
                                        {isActive ? 'AKTİF' : 'MODÜL'}
                                    </span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-lg font-bold text-white">
                                            {mod.price.toLocaleString('tr-TR')}₺
                                        </span>
                                        <span className="text-slate-400 text-xs">/yıl</span>
                                    </div>
                                </div>
                                <p className="text-sm font-semibold text-white">{mod.name}</p>
                                <ul className="mt-2 space-y-1">
                                    {mod.features.map((f, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-1.5 text-xs text-slate-400"
                                        >
                                            <svg
                                                className={`w-3.5 h-3.5 text-${mod.color}-400 flex-shrink-0 mt-0.5`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Ödeme Formu — seçim yapıldığında görünür */}
            {selectedPlan && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                            {getPlanLabel(selectedPlan)} —{' '}
                            {getPrice(selectedPlan).toLocaleString('tr-TR')}₺/yıl
                        </h3>
                        <button
                            onClick={() => setSelectedPlan(null)}
                            className="text-slate-400 hover:text-white text-xs"
                        >
                            İptal
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs text-slate-400 mb-1">Ad Soyad *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="Adınız Soyadınız"
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs text-slate-400 mb-1">Email *</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="ornek@email.com"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs text-slate-400 mb-1">Telefon</label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="0532 123 45 67 (opsiyonel)"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleCreditCard}
                            disabled={true}
                            title="iyzico entegrasyonu aktifleştirildiğinde kullanılabilir"
                            className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm transition-colors"
                        >
                            Kredi Kartı (Yakında)
                        </button>
                        <button
                            onClick={handleBankTransfer}
                            disabled={!formData.name || !formData.email || submitting}
                            className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-medium text-sm transition-colors"
                        >
                            {submitting ? 'Gönderiliyor...' : 'Havale/EFT ile Öde'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Subscription;
