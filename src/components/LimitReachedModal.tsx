import React from 'react';
import { Link } from 'react-router-dom';

interface LimitReachedModalProps {
    open: boolean;
    onClose: () => void;
    resource: 'mukellef' | 'kredi' | 'deneme';
    used?: number;
    limit?: number;
    isTrial?: boolean;
}

const MESSAGES: Record<
    LimitReachedModalProps['resource'],
    { title: string; body: (used?: number, limit?: number) => string; icon: string }
> = {
    mukellef: {
        title: 'Mükellef Limitine Ulaştınız',
        icon: '👥',
        body: (used, limit) =>
            `Mevcut planınızda ${limit ?? 0} mükellef ekleyebiliyorsunuz ve şu an ${used ?? limit ?? 0} mükellefiniz bulunuyor. Daha fazla mükellef eklemek için aboneliğinizi yükseltin.`,
    },
    kredi: {
        title: 'Kredi Limitine Ulaştınız',
        icon: '💳',
        body: (used, limit) =>
            `Bu aylık kredi hakkınız ${limit ?? 0} olarak tanımlı ve tamamını kullandınız. Devam etmek için ek kredi satın alın veya aboneliğinizi yükseltin.`,
    },
    deneme: {
        title: 'Deneme Süreniz Doldu',
        icon: '⏱️',
        body: () =>
            '14 günlük ücretsiz deneme süreniz sona erdi. Özellikleri kullanmaya devam etmek için abone olun.',
    },
};

const LimitReachedModal: React.FC<LimitReachedModalProps> = ({
    open,
    onClose,
    resource,
    used,
    limit,
    isTrial = false,
}) => {
    if (!open) return null;

    const content = MESSAGES[resource];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-center">
                    <div className="text-5xl mb-4">{content.icon}</div>
                    <h2 className="text-xl font-bold text-white mb-3">{content.title}</h2>
                    <p className="text-slate-400 text-sm mb-6">{content.body(used, limit)}</p>

                    {isTrial && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6">
                            <p className="text-xs text-amber-300">
                                Deneme sürümünde limitler normal planın 1/10&apos;udur. Tam plana
                                geçerek tüm limitleri kullanabilirsiniz.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <Link
                            to="/subscription"
                            onClick={onClose}
                            className="block w-full py-3 bg-gradient-to-r from-sky-600 to-purple-600 hover:shadow-[0_8px_30px_rgba(56,189,248,0.3)] text-white text-center rounded-lg font-bold transition-all"
                        >
                            Aboneliği Yükselt
                        </Link>
                        <button
                            type="button"
                            onClick={onClose}
                            className="block w-full py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            Kapat
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LimitReachedModal;
