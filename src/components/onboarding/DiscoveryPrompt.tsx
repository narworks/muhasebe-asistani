import React, { useEffect } from 'react';

interface Props {
    firmName?: string;
    onDismiss: () => void; // "Sonra yap" veya kapat
    onStart: () => void; // "Şimdi Keşif Başlat" — parent Keşif akışını tetikler
}

/**
 * İlk mükellef eklendikten sonra otomatik olarak gösterilen prompt.
 * Kullanıcıyı Keşif özelliğine yönlendirir — bekleyen tebligatları
 * önceden görme, kredi harcamadan.
 *
 * settings.onboarding.firstClientAddedAt VAR + firstDiscoveryAt YOK
 * durumunda bir kez gösterilir.
 */
const DiscoveryPrompt: React.FC<Props> = ({ firmName, onDismiss, onStart }) => {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onDismiss]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[520px] max-w-[92vw] shadow-2xl overflow-hidden">
                {/* Success header */}
                <div className="px-8 py-6 bg-gradient-to-br from-emerald-500/10 to-sky-500/10 border-b border-slate-700 text-center">
                    <div className="text-5xl mb-2">🎉</div>
                    <h2 className="text-xl font-bold text-white">
                        {firmName ? `${firmName} eklendi!` : 'İlk mükellefiniz eklendi!'}
                    </h2>
                </div>

                {/* Body */}
                <div className="px-8 py-6">
                    <p className="text-slate-300 leading-relaxed mb-4">
                        Şimdi bu mükellef için GİB&apos;deki bekleyen tebligatları görelim.
                    </p>

                    <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                            <div className="text-2xl">🔍</div>
                            <div className="flex-1">
                                <h3 className="text-white font-semibold text-sm mb-1">
                                    Keşif özelliği
                                </h3>
                                <p className="text-slate-300 text-sm leading-relaxed">
                                    Bekleyen tebligatların <strong>listesini</strong> önce
                                    göstererek dokümanları indirmeden önce inceleyebilirsiniz.
                                </p>
                                <ul className="mt-2 text-xs text-slate-400 space-y-0.5">
                                    <li>⚡ Sadece 10-15 saniye sürer</li>
                                    <li>💳 Kredi harcanmaz</li>
                                    <li>✨ İndirmek istediklerinizi seçebilirsiniz</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-slate-500 text-center">
                        Manuel işlemle 5-10 dakika süren bu iş 15 saniyeye iner.
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={onDismiss}
                        className="flex-1 px-4 py-2.5 text-slate-400 hover:text-white text-sm rounded-lg transition-colors"
                    >
                        Sonra Yap
                    </button>
                    <button
                        onClick={onStart}
                        autoFocus
                        className="flex-1 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:shadow-[0_4px_20px_rgba(56,189,248,0.4)] text-white rounded-lg font-semibold text-sm transition-all"
                    >
                        🔍 Şimdi Keşif Başlat
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DiscoveryPrompt;
