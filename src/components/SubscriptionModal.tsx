import React, { useState, useEffect } from 'react';

// Module definitions — single source of truth for desktop app
const MODULES = {
    excel_assistant: {
        id: 'excel_assistant',
        name: 'Excel Asistanı',
        shortName: 'Excel',
        price: 2500,
        color: 'indigo',
        features: [
            'Excel, CSV, PDF dönüştürme',
            'Akıllı veri işleme ve şablonlar',
            'Sonuçları Excel olarak indirme',
        ],
    },
    e_tebligat: {
        id: 'e_tebligat',
        name: 'E-Tebligat Kontrol',
        shortName: 'Tebligat',
        price: 5000,
        color: 'sky',
        features: [
            'Otomatik GİB e-tebligat tarama',
            'Döküman indirme ve arşivleme',
            'Çoklu mükellef yönetimi',
        ],
    },
};

const BUNDLE_PRICE = 6000;
const ALL_MODULE_IDS = Object.keys(MODULES);

type PlanChoice = 'excel_assistant' | 'e_tebligat' | 'bundle';
type Step = 'plan' | 'payment';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: {
        isActive: boolean;
        plan?: string | null;
        status: string;
        isTrial?: boolean;
        modules?: string[];
    } | null;
    currentUserEmail: string;
    defaultModule?: string;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
    isOpen,
    onClose,
    subscription,
    currentUserEmail,
    defaultModule,
}) => {
    const [credits, setCredits] = useState<{
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
    } | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<PlanChoice>(
        (defaultModule as PlanChoice) || 'bundle'
    );
    const [step, setStep] = useState<Step>('plan');
    const [formData, setFormData] = useState({
        name: '',
        email: currentUserEmail || '',
        phone: '',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && subscription?.isActive) {
            window.electronAPI
                .getCredits()
                .then(setCredits)
                .catch(() => {});
        }
        if (isOpen && !subscription?.isActive) {
            setStep('plan');
            setSelectedPlan((defaultModule as PlanChoice) || 'bundle');
            setFormData((prev) => ({ ...prev, email: currentUserEmail || '' }));
        }
    }, [isOpen, subscription, currentUserEmail, defaultModule]);

    if (!isOpen) return null;

    const handleClose = () => {
        setStep('plan');
        onClose();
    };

    const getPrice = (plan: PlanChoice): number => {
        if (plan === 'bundle') return BUNDLE_PRICE;
        return MODULES[plan]?.price || 0;
    };

    const getPlanId = (plan: PlanChoice): string => {
        if (plan === 'bundle') return 'plan-bundle-annual';
        return `plan-${plan === 'excel_assistant' ? 'excel' : 'etebligat'}-annual`;
    };

    const getPlanLabel = (plan: PlanChoice): string => {
        if (plan === 'bundle') return 'Tam Paket';
        return MODULES[plan]?.name || plan;
    };

    // TODO: Re-enable when iyzico is active
    const _handleCreditCardPayment = async () => {
        if (!formData.name || !formData.email) return;
        try {
            await window.electronAPI.openCheckout({
                plan: getPlanId(selectedPlan),
                period: 'annual',
                email: formData.email,
                name: formData.name,
                phone: formData.phone,
            });
        } catch {
            // Fallback
        }
        handleClose();
    };

    const handleBankTransfer = async () => {
        if (!formData.name || !formData.email) return;
        setSubmitting(true);
        try {
            const response = await fetch('https://muhasebeasistani.com/api/contact', {
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
            if (response.ok) {
                handleClose();
                alert('Başvurunuz alındı! Banka hesap bilgileri email adresinize gönderilecektir.');
            } else {
                alert('Bir hata oluştu. Lütfen tekrar deneyin.');
            }
        } catch {
            alert('Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.');
        } finally {
            setSubmitting(false);
        }
    };

    const CheckIcon = () => (
        <svg
            className="w-4 h-4 text-emerald-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
        >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    );

    const CloseButton = () => (
        <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>
    );

    // Aktif Abone Görünümü
    if (subscription?.isActive) {
        const monthlyPercent = credits
            ? Math.round((credits.monthlyUsed / credits.monthlyLimit) * 100)
            : 0;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-white">Abonelik</h2>
                            {subscription.modules && subscription.modules.length > 0 && (
                                <div className="flex gap-1">
                                    {subscription.modules.length >= ALL_MODULE_IDS.length ? (
                                        <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                                            Tam Paket
                                        </span>
                                    ) : (
                                        subscription.modules.map((m) => (
                                            <span
                                                key={m}
                                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    m === 'e_tebligat'
                                                        ? 'text-sky-400 bg-sky-400/10'
                                                        : 'text-indigo-400 bg-indigo-400/10'
                                                }`}
                                            >
                                                {MODULES[m as keyof typeof MODULES]?.shortName || m}
                                            </span>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                        <CloseButton />
                    </div>

                    <div className="p-4 space-y-3">
                        {credits && (
                            <>
                                <div>
                                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                                        <span>Aylık Kredi</span>
                                        <span className="text-white">
                                            {credits.monthlyRemaining.toLocaleString('tr-TR')} /{' '}
                                            {credits.monthlyLimit.toLocaleString('tr-TR')}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-slate-700 rounded-full">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                                monthlyPercent > 80
                                                    ? 'bg-red-500'
                                                    : monthlyPercent > 60
                                                      ? 'bg-amber-500'
                                                      : 'bg-emerald-500'
                                            }`}
                                            style={{
                                                width: `${Math.min(100, 100 - monthlyPercent)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Ek Kredi</span>
                                    <span className="text-white">
                                        {credits.purchasedRemaining.toLocaleString('tr-TR')}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
                                    <span className="text-white font-medium">Toplam</span>
                                    <span
                                        className={`font-semibold ${credits.totalRemaining < 500 ? 'text-amber-400' : 'text-emerald-400'}`}
                                    >
                                        {credits.totalRemaining.toLocaleString('tr-TR')} kredi
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex gap-2 p-4 border-t border-slate-700">
                        <button
                            onClick={() => window.electronAPI.purchaseCredits()}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                        >
                            Ek Kredi Al
                        </button>
                        <button
                            onClick={() => window.electronAPI.openBillingPortal()}
                            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                        >
                            Yönetim
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Step 1: Modül Seçimi
    if (step === 'plan') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-lg relative">
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                        <h2 className="text-base font-semibold text-white">Modül Seçin</h2>
                        <CloseButton />
                    </div>

                    <div className="p-5 space-y-3">
                        {/* Tam Paket */}
                        <button
                            type="button"
                            onClick={() => setSelectedPlan('bundle')}
                            className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                                selectedPlan === 'bundle'
                                    ? 'border-emerald-500 bg-emerald-500/10'
                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                        TÜM MODÜLLER
                                    </span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                        EN İYİ FİYAT
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-white">6.000₺</span>
                                    <span className="text-slate-400 text-sm">/yıl</span>
                                    <span className="text-sm text-slate-500 line-through ml-1">
                                        7.500₺
                                    </span>
                                </div>
                            </div>
                            <p className="text-sm font-semibold text-white mb-1">Tam Paket</p>
                            <p className="text-xs text-emerald-400">
                                1.500₺ tasarruf • 5.000 aylık kredi
                            </p>
                        </button>

                        <p className="text-center text-xs text-slate-500">veya tek modül seçin</p>

                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(MODULES).map(([id, mod]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedPlan(id as PlanChoice)}
                                    className={`text-left rounded-xl p-4 border-2 transition-all ${
                                        selectedPlan === id
                                            ? `border-${mod.color}-500 bg-${mod.color}-500/10`
                                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                                    }`}
                                >
                                    <span
                                        className={`text-xs font-semibold px-2 py-0.5 rounded bg-${mod.color}-500/20 text-${mod.color}-400`}
                                    >
                                        MODÜL
                                    </span>
                                    <p className="text-sm font-semibold text-white mt-2">
                                        {mod.name}
                                    </p>
                                    <div className="flex items-baseline gap-1 mt-1">
                                        <span className="text-lg font-bold text-white">
                                            {mod.price.toLocaleString('tr-TR')}₺
                                        </span>
                                        <span className="text-slate-400 text-xs">/yıl</span>
                                    </div>
                                    <ul className="mt-2 space-y-1">
                                        {mod.features.map((f, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-1.5 text-xs text-slate-400"
                                            >
                                                <CheckIcon />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setStep('payment')}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-3 rounded-lg transition-colors mt-2"
                        >
                            Devam Et — {getPlanLabel(selectedPlan)} (
                            {getPrice(selectedPlan).toLocaleString('tr-TR')}₺/yıl)
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Ödeme Bilgileri + Yöntem
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                    <button
                        onClick={() => setStep('plan')}
                        className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                        Geri
                    </button>
                    <CloseButton />
                </div>

                <div className="p-5">
                    <div className="bg-slate-800 rounded-lg p-3 mb-5">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">
                                {getPlanLabel(selectedPlan)}
                            </span>
                            <span className="text-white font-semibold">
                                {getPrice(selectedPlan).toLocaleString('tr-TR')}₺/yıl
                            </span>
                        </div>
                    </div>

                    <div className="space-y-3 mb-5">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                                Ad Soyad *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="Adınız Soyadınız"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                                Email *
                            </label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) =>
                                    setFormData({ ...formData, email: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="ornek@email.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                                Telefon
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) =>
                                    setFormData({ ...formData, phone: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                                placeholder="0532 123 45 67 (opsiyonel)"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <button
                            disabled={true}
                            title="iyzico entegrasyonu aktifleştirildiğinde kullanılabilir"
                            className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            Kredi Kartı (Yakında)
                        </button>
                        <button
                            onClick={handleBankTransfer}
                            disabled={!formData.name || !formData.email || submitting}
                            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            {submitting ? 'Gönderiliyor...' : 'Havale/EFT ile Öde'}
                        </button>
                    </div>

                    <p className="text-[10px] text-slate-500 text-center mt-3">
                        Ödeme işlemleri iyzico güvencesi ile gerçekleştirilmektedir.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionModal;
