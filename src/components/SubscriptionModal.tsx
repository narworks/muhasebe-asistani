import React, { useState, useEffect } from 'react';

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: { isActive: boolean; plan: string | null; status: string } | null;
    currentUserEmail: string;
}

type Step = 'plan' | 'payment' | 'form';

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
    isOpen,
    onClose,
    subscription,
    currentUserEmail,
}) => {
    const [credits, setCredits] = useState<{
        monthlyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        purchasedRemaining: number;
        totalRemaining: number;
        resetAt: string | null;
    } | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
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
        // Reset to plan step when modal opens
        if (isOpen && !subscription?.isActive) {
            setStep('plan');
            setFormData((prev) => ({ ...prev, email: currentUserEmail || '' }));
        }
    }, [isOpen, subscription, currentUserEmail]);

    if (!isOpen) return null;

    const handleClose = () => {
        setStep('plan');
        onClose();
    };

    const purchaseCredits = async () => {
        try {
            await window.electronAPI.purchaseCredits();
        } catch (error) {
            console.error('Credit purchase portal could not be opened', error);
        }
    };

    const handleCreditCardPayment = async () => {
        if (!formData.name || !formData.email) return;

        // Open checkout page with user info
        const params = new URLSearchParams();
        params.set('plan', billingPeriod === 'annual' ? 'plan-pro-annual' : 'plan-pro-monthly');
        params.set('period', billingPeriod);
        params.set('email', formData.email);
        params.set('name', formData.name);
        if (formData.phone) params.set('phone', formData.phone);

        const checkoutUrl = `https://muhasebeasistani.com/billing/checkout?${params.toString()}`;

        try {
            await window.electronAPI.openBillingPortal(
                `checkout:${billingPeriod === 'annual' ? 'plan-pro-annual' : 'plan-pro'}`
            );
        } catch {
            // Fallback: open in billing portal window
            window.open(checkoutUrl, '_blank');
        }
        handleClose();
    };

    const handleBankTransfer = async () => {
        if (!formData.name || !formData.email) return;
        setSubmitting(true);

        try {
            // Send contact form to API
            const response = await fetch('https://muhasebeasistani.com/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    plan: 'pro',
                    billingPeriod,
                    source: 'desktop_app',
                }),
            });

            if (response.ok) {
                setStep('plan');
                handleClose();
                // Show success message (could use a toast)
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

    const monthlyPercent = credits
        ? Math.round((credits.monthlyUsed / credits.monthlyLimit) * 100)
        : 0;

    const remainingPercent = 100 - monthlyPercent;

    // Aktif Abone Görünümü
    if (subscription?.isActive) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-white">Abonelik</h2>
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                                Pro
                            </span>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Kredi Bilgileri */}
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
                                            style={{ width: `${Math.min(100, remainingPercent)}%` }}
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
                                {credits.resetAt && (
                                    <p className="text-xs text-slate-500">
                                        Yenileme:{' '}
                                        {new Date(credits.resetAt).toLocaleDateString('tr-TR')}
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Aksiyon Butonları */}
                    <div className="flex gap-2 p-4 border-t border-slate-700">
                        <button
                            onClick={purchaseCredits}
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

    // Pasif Kullanıcı - Plan Seçimi (Step 1)
    if (step === 'plan') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                        <h2 className="text-base font-semibold text-white">Abonelik</h2>
                        <button
                            onClick={handleClose}
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    <div className="p-5">
                        {/* Plan Başlığı */}
                        <div className="text-center mb-5">
                            <h3 className="text-lg font-semibold text-white">
                                Muhasebe Asistanı Pro
                            </h3>
                            <p className="text-slate-400 text-sm mt-1">5.000 aylık kredi dahil</p>
                        </div>

                        {/* Fiyat Gösterimi */}
                        <div className="text-center mb-5">
                            <div className="text-3xl font-bold text-white">
                                {billingPeriod === 'monthly' ? '500₺' : '5.000₺'}
                                <span className="text-lg font-normal text-slate-400">
                                    /{billingPeriod === 'monthly' ? 'ay' : 'yıl'}
                                </span>
                            </div>
                            {billingPeriod === 'annual' && (
                                <p className="text-emerald-400 text-sm mt-1">
                                    Yıllık ödemede 1.000₺ tasarruf
                                </p>
                            )}
                        </div>

                        {/* Aylık/Yıllık Toggle */}
                        <div className="flex bg-slate-800 rounded-lg p-1 mb-5">
                            <button
                                onClick={() => setBillingPeriod('monthly')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                    billingPeriod === 'monthly'
                                        ? 'bg-slate-700 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Aylık
                            </button>
                            <button
                                onClick={() => setBillingPeriod('annual')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                                    billingPeriod === 'annual'
                                        ? 'bg-slate-700 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Yıllık
                            </button>
                        </div>

                        {/* Devam Et Butonu */}
                        <button
                            onClick={() => setStep('payment')}
                            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                        >
                            Devam Et
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Pasif Kullanıcı - Ödeme Yöntemi Seçimi (Step 2)
    if (step === 'payment') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-lg w-full max-w-sm relative">
                    {/* Header */}
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
                        <button
                            onClick={handleClose}
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    <div className="p-5">
                        {/* Seçilen Plan Özeti */}
                        <div className="bg-slate-800 rounded-lg p-3 mb-5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 text-sm">Pro Abonelik</span>
                                <span className="text-white font-semibold">
                                    {billingPeriod === 'monthly' ? '500₺/ay' : '5.000₺/yıl'}
                                </span>
                            </div>
                        </div>

                        {/* Kullanıcı Bilgileri Formu */}
                        <div className="space-y-3 mb-5">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">
                                    Ad Soyad *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, name: e.target.value })
                                    }
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

                        {/* Ödeme Yöntemi Butonları */}
                        <div className="space-y-2">
                            <button
                                onClick={handleCreditCardPayment}
                                disabled={!formData.name || !formData.email}
                                className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <span>💳</span>
                                Kredi Kartı ile Öde
                            </button>
                            <button
                                onClick={handleBankTransfer}
                                disabled={!formData.name || !formData.email || submitting}
                                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <span>🏦</span>
                                {submitting ? 'Gönderiliyor...' : 'Havale/EFT ile Öde'}
                            </button>
                        </div>

                        <p className="text-[10px] text-slate-500 text-center mt-3">
                            Ödeme işlemleri güvenli altyapı ile gerçekleştirilmektedir.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default SubscriptionModal;
