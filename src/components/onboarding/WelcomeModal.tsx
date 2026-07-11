import React, { useState, useEffect } from 'react';

interface Props {
    isTrial: boolean;
    trialDaysLeft?: number;
    onClose: () => void;
    onStart: () => void; // "Başla" → E-Tebligat/Mükellefler sekmesine yönlendir
}

/**
 * İlk kez giriş yapan kullanıcıya gösterilen 3 slide'lık welcome modal.
 * settings.onboarding.seenWelcomeAt boş ise App.tsx tarafından render edilir.
 *
 * "Atla" (X butonu) veya "Başla" — her ikisi de seenWelcomeAt'i işaretler,
 * yani modal sadece bir kez gösterilir. Sidebar'daki "?" ikonu resetleyebilir.
 */
const WelcomeModal: React.FC<Props> = ({ isTrial, trialDaysLeft, onClose, onStart }) => {
    const [slideIndex, setSlideIndex] = useState(0);

    // Escape → kapat + seenWelcomeAt işaretle
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const isLast = slideIndex === 2;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[560px] max-w-[92vw] shadow-2xl overflow-hidden">
                {/* Header — X kapat + progress dots */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700">
                    <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === slideIndex
                                        ? 'w-6 bg-sky-400'
                                        : i < slideIndex
                                          ? 'w-1.5 bg-sky-400/50'
                                          : 'w-1.5 bg-slate-600'
                                }`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1"
                        aria-label="Atla ve kapat"
                    >
                        Atla ✕
                    </button>
                </div>

                {/* Body */}
                <div className="px-8 py-10 min-h-[320px]">
                    {slideIndex === 0 && (
                        <div className="text-center">
                            <div className="text-5xl mb-4">👋</div>
                            <h2 className="text-2xl font-bold text-white mb-3">
                                Muhasebe Asistanı&apos;na Hoşgeldiniz
                            </h2>
                            <p className="text-slate-400 leading-relaxed">
                                E-Tebligat kontrolü ve banka ekstresi Excel dönüşümü artık dakikalar
                                sürüyor.
                                <br />3 adımda başlayalım.
                            </p>
                            {isTrial && trialDaysLeft !== undefined && (
                                <div className="mt-6 inline-block px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-300 text-sm">
                                    🎁 {trialDaysLeft} gün ücretsiz deneme aktif
                                </div>
                            )}
                        </div>
                    )}

                    {slideIndex === 1 && (
                        <div>
                            <h2 className="text-xl font-bold text-white mb-6 text-center">
                                E-Tebligat Nasıl Çalışır?
                            </h2>
                            <div className="space-y-5">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-lg font-bold">
                                        1
                                    </div>
                                    <div>
                                        <h3 className="text-white font-semibold mb-1">
                                            Mükelleflerinizi Ekleyin
                                        </h3>
                                        <p className="text-slate-400 text-sm">
                                            Firma adı + GİB kullanıcı kodu + şifre. Tek tek veya
                                            Excel ile toplu.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-lg font-bold">
                                        2
                                    </div>
                                    <div>
                                        <h3 className="text-white font-semibold mb-1">
                                            Keşif ile Önizleyin
                                        </h3>
                                        <p className="text-slate-400 text-sm">
                                            10 saniyede bekleyen tebligatları görün. Kredi
                                            harcanmaz.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-lg font-bold">
                                        3
                                    </div>
                                    <div>
                                        <h3 className="text-white font-semibold mb-1">
                                            Tarayın &amp; İndirin
                                        </h3>
                                        <p className="text-slate-400 text-sm">
                                            Otomatik tarama tüm dökümanları indirir, mükellef
                                            bazında arşivler.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {slideIndex === 2 && (
                        <div className="text-center">
                            <div className="text-5xl mb-4">🚀</div>
                            <h2 className="text-2xl font-bold text-white mb-3">Başlayalım</h2>
                            <p className="text-slate-400 leading-relaxed mb-6">
                                İlk mükellefinizi eklemek için sizi doğru yere yönlendireceğim.
                                <br />
                                İlk taramanız yaklaşık{' '}
                                <span className="text-white font-medium">60 saniye</span> sürer.
                            </p>
                            {isTrial && (
                                <p className="text-xs text-slate-500">
                                    Deneme süresince: 20 mükellef · 500 kredi · Tüm modüller aktif
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer — Geri / İleri / Başla */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                        disabled={slideIndex === 0}
                        className="px-4 py-2 text-slate-400 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        ← Geri
                    </button>
                    {isLast ? (
                        <button
                            onClick={onStart}
                            autoFocus
                            className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-purple-600 hover:shadow-[0_4px_20px_rgba(56,189,248,0.4)] text-white rounded-lg font-semibold transition-all"
                        >
                            Başla →
                        </button>
                    ) : (
                        <button
                            onClick={() => setSlideIndex((i) => Math.min(2, i + 1))}
                            autoFocus
                            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition-colors"
                        >
                            İleri →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WelcomeModal;
