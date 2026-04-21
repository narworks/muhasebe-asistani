import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

// --- CHANGELOG DATA ---
type ChangeEntry = { type: '+' | '~' | '-'; text: string };
type VersionLog = { version: string; date: string; entries: ChangeEntry[] };

const CHANGELOG: VersionLog[] = [
    {
        version: '1.3.41',
        date: '2026-04-14',
        entries: [
            {
                type: '~',
                text: 'Ke\u015fif a\u011f hatas\u0131 sonras\u0131 Tara/Ke\u015fif butonlar\u0131n\u0131n kaybolma sorunu d\u00fczeltildi',
            },
        ],
    },
    {
        version: '1.3.4',
        date: '2026-04-14',
        entries: [
            {
                type: '~',
                text: 'Ke\u015fif sonras\u0131 indirme hatas\u0131 (409 Conflict) d\u00fczeltildi',
            },
            {
                type: '~',
                text: '\u0130lk Ke\u015fif sonras\u0131 Tara butonu g\u00f6r\u00fcnmeme sorunu d\u00fczeltildi',
            },
            {
                type: '~',
                text: 'T\u00fcm tebligatlar\u0131 atla se\u00e7ene\u011fi art\u0131k m\u00fckellefi ke\u015fif yap\u0131lm\u0131\u015f olarak i\u015faretler',
            },
        ],
    },
    {
        version: '1.3.0',
        date: '2026-04-12',
        entries: [
            {
                type: '+',
                text: 'Tab tabanl\u0131 sayfa yap\u0131s\u0131 \u2014 Tarama, Sonu\u00e7lar, M\u00fckellefler, Zamanlama',
            },
            {
                type: '+',
                text: 'Excel Asistan\u0131: t\u00fcm sayfalar\u0131 oku, para format\u0131 koru, g\u00fc\u00e7l\u00fc AI prompt',
            },
            {
                type: '+',
                text: 'Toast bildirimleri \u2014 tarama, hata, i\u00e7e aktarma bildirimleri',
            },
            {
                type: '~',
                text: 'G\u00fcvenlik: IPC listener izolasyonu, oturum korumas\u0131, admin yetkilendirme',
            },
        ],
    },
    {
        version: '1.2.0',
        date: '2026-04-10',
        entries: [
            {
                type: '~',
                text: 'Aray\u00fcz yap\u0131s\u0131 yenilendi \u2014 daha h\u0131zl\u0131 ve s\u00fcrd\u00fcr\u00fclebilir mimari',
            },
            {
                type: '+',
                text: '\u0130ndirme hatalar\u0131 art\u0131k detayl\u0131 log\u2019da g\u00f6r\u00fcn\u00fcyor',
            },
        ],
    },
    {
        version: '1.1.0',
        date: '2026-04-10',
        entries: [
            {
                type: '+',
                text: 'Excel \u015fablon indirme + format do\u011frulama ile toplu m\u00fckellef aktar\u0131m\u0131',
            },
            {
                type: '+',
                text: 'Tarama ge\u00e7mi\u015fi detay\u0131 \u2014 sat\u0131ra t\u0131klay\u0131nca m\u00fckellef sonu\u00e7lar\u0131',
            },
            {
                type: '+',
                text: '\u0130ndirme tekrar\u0131 engeli \u2014 mevcut belgeler atlan\u0131r',
            },
            { type: '~', text: 'Windows T\u00fcrk\u00e7e karakter dosya yolu d\u00fczeltmesi' },
        ],
    },
    {
        version: '1.0.96',
        date: '2026-04-08',
        entries: [
            {
                type: '+',
                text: '\u0130lk Ke\u015fif butonu \u2014 6 farkl\u0131 zaman aral\u0131\u011f\u0131 se\u00e7ene\u011fi',
            },
            {
                type: '+',
                text: 'Tarama ge\u00e7mi\u015fi tablosu + Ba\u015far\u0131s\u0131zlar\u0131 Tekrar Dene butonu',
            },
            { type: '+', text: '\u015eifre test butonu (m\u00fckellef baz\u0131nda)' },
            { type: '~', text: 'getTebligatlar limiti 200 \u2192 50000' },
        ],
    },
    {
        version: '1.0.90',
        date: '2026-04-04',
        entries: [
            { type: '+', text: 'Sentry hata takibi entegrasyonu (PII-safe)' },
            { type: '+', text: 'Rate limit korunmas\u0131 + monotonic clock' },
            { type: '~', text: 'downloadDocument null yerine Error f\u0131rlat\u0131yor' },
        ],
    },
    {
        version: '1.0.77',
        date: '2026-03-28',
        entries: [
            {
                type: '+',
                text: 'Yeni tebligat paneli \u2014 tarama sonras\u0131 sa\u011fda detayl\u0131 panel a\u00e7\u0131l\u0131r',
            },
            {
                type: '+',
                text: 'Tarama ge\u00e7mi\u015fi \u2014 her taramada yeni/eski say\u0131lar\u0131 g\u00f6r\u00fcn\u00fcr',
            },
            { type: '+', text: "Excel'den toplu m\u00fckellef aktar\u0131m\u0131" },
            { type: '+', text: 'M\u00fckellef ekleme limiti (200 hak) ve sayac\u0131' },
            { type: '+', text: 'Uygulama i\u00e7i destek formu' },
            { type: '~', text: 'Daha b\u00fcy\u00fck pencere boyutu (1440x960)' },
            { type: '~', text: 'M\u00fckerrer m\u00fckellef ekleme engeli' },
            { type: '-', text: 'Vekalet sorgu sistemi kald\u0131r\u0131ld\u0131' },
        ],
    },
];

const entryColor = { '+': 'text-emerald-400', '~': 'text-sky-400', '-': 'text-red-400' };

// --- ICONS ---
const BarChartIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
    </svg>
);

const WrenchIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z"
        />
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
    </svg>
);

const ChartPieIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
        />
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
        />
    </svg>
);

const LogoutIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
    </svg>
);

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-5 w-5 ${spinning ? 'animate-spin' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
    </svg>
);

const MailIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
    </svg>
);

// Lock icon for inactive modules
const LockIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-slate-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
    </svg>
);

// Credit card icon for subscription
const CreditCardIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
    </svg>
);

const Sidebar: React.FC = () => {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const [modules, setModules] = useState<string[]>([]);
    const [isTrial, setIsTrial] = useState(false);
    const [supportOpen, setSupportOpen] = useState(false);
    const [supportSubject, setSupportSubject] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const [supportSending, setSupportSending] = useState(false);
    const [supportSent, setSupportSent] = useState(false);
    const [supportError, setSupportError] = useState('');
    const [changelogOpen, setChangelogOpen] = useState(false);

    useEffect(() => {
        const fetchModules = () => {
            window.electronAPI
                .getSubscriptionStatus()
                .then((sub) => {
                    setModules(sub.modules || []);
                    setIsTrial(sub.isTrial || false);
                })
                .catch(() => {});
        };
        fetchModules();
        // Retry periodically until modules are loaded
        const interval = setInterval(() => {
            fetchModules();
        }, 5000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const hasModule = (id: string) => isTrial || modules.includes(id);

    const navLinkClasses =
        'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200';
    const activeLinkClasses = 'bg-sky-500 text-white';
    const inactiveLinkClasses = 'text-slate-400 hover:bg-slate-700 hover:text-white';

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    // Manual "refresh license" — force pull fresh subscription state from Supabase.
    // For users whose admin has just converted them trial→paid via bank transfer:
    // lets them see the change immediately instead of waiting up to 6h for the
    // background poller or 2min for the focus-triggered check.
    const [refreshingLicense, setRefreshingLicense] = useState(false);
    const handleRefreshLicense = async () => {
        if (refreshingLicense) return;
        setRefreshingLicense(true);
        try {
            const result = await window.electronAPI.checkLicense();
            if (result?.success) {
                toast.success('Abonelik bilgileri güncellendi');
            } else {
                toast.error(result?.message || 'Güncelleme başarısız');
            }
        } catch (err) {
            toast.error('Bağlantı hatası: ' + (err as Error).message);
        } finally {
            setRefreshingLicense(false);
        }
    };

    return (
        <div className="w-64 bg-slate-900 border-r border-slate-700 p-4 flex flex-col">
            <div>
                <div className="text-2xl font-bold text-white mb-10 text-center">
                    <span className="text-sky-400">MA</span> Kutu
                </div>
                {/* Main navigation */}
                <nav className="flex flex-col space-y-2">
                    <NavLink
                        to="/"
                        end
                        className={({ isActive }) =>
                            `${navLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`
                        }
                    >
                        <BarChartIcon />
                        <span>Ana Panel</span>
                    </NavLink>
                    {hasModule('excel_assistant') ? (
                        <NavLink
                            to="/tools/statement-converter"
                            className={({ isActive }) =>
                                `${navLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`
                            }
                        >
                            <WrenchIcon />
                            <span>Excel Asistan&#305;</span>
                        </NavLink>
                    ) : (
                        <button
                            onClick={() => navigate('/subscription')}
                            className={`${navLinkClasses} text-slate-600 hover:text-slate-400 w-full`}
                        >
                            <WrenchIcon />
                            <span className="flex-1 text-left">Excel Asistan&#305;</span>
                            <LockIcon />
                        </button>
                    )}
                    {hasModule('e_tebligat') ? (
                        <NavLink
                            to="/tools/e-tebligat"
                            className={({ isActive }) =>
                                `${navLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`
                            }
                        >
                            <MailIcon />
                            <span>E-Tebligat</span>
                        </NavLink>
                    ) : (
                        <button
                            onClick={() => navigate('/subscription')}
                            className={`${navLinkClasses} text-slate-600 hover:text-slate-400 w-full`}
                        >
                            <MailIcon />
                            <span className="flex-1 text-left">E-Tebligat</span>
                            <LockIcon />
                        </button>
                    )}
                </nav>
            </div>

            {/* Secondary nav + user — pushed to bottom */}
            <div className="mt-auto">
                <div className="pt-4 border-t border-slate-700/50 mb-3">
                    <nav className="flex flex-col space-y-1">
                        <NavLink
                            to="/statistics"
                            className={({ isActive }) =>
                                `${navLinkClasses} text-sm ${isActive ? activeLinkClasses : inactiveLinkClasses}`
                            }
                        >
                            <ChartPieIcon />
                            <span>&#304;statistikler</span>
                        </NavLink>
                        <NavLink
                            to="/subscription"
                            className={({ isActive }) =>
                                `${navLinkClasses} text-sm ${isActive ? activeLinkClasses : inactiveLinkClasses}`
                            }
                        >
                            <CreditCardIcon />
                            <span>Abonelik</span>
                        </NavLink>
                        <button
                            onClick={() => setSupportOpen(true)}
                            className={`${navLinkClasses} text-sm ${inactiveLinkClasses} w-full`}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                                />
                            </svg>
                            <span>Destek</span>
                        </button>
                    </nav>
                </div>

                {/* Support Modal */}
                {supportOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
                        onClick={() => setSupportOpen(false)}
                    >
                        <div
                            className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4 p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold text-white mb-1">Destek Talebi</h3>
                            <p className="text-sm text-slate-400 mb-4">
                                Sorular&#305;n&#305;z veya sorunlar&#305;n&#305;z i&ccedil;in bize
                                yaz&#305;n.
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                                        Konu
                                    </label>
                                    <input
                                        type="text"
                                        value={supportSubject}
                                        onChange={(e) => setSupportSubject(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                                        placeholder="&Ouml;rn: Tarama hatas&#305;"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                                        Mesaj
                                    </label>
                                    <textarea
                                        value={supportMessage}
                                        onChange={(e) => setSupportMessage(e.target.value)}
                                        rows={5}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none resize-none"
                                        placeholder="Sorununuzu detayl&#305; a&ccedil;&#305;klay&#305;n..."
                                    />
                                </div>
                            </div>
                            {supportSent && (
                                <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
                                    Destek talebiniz g&ouml;nderildi. En k&#305;sa s&uuml;rede
                                    d&ouml;n&uuml;&#351; yapaca&#287;&#305;z.
                                </div>
                            )}
                            {supportError && (
                                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                                    {supportError}
                                </div>
                            )}
                            <div className="flex justify-end gap-3 mt-5">
                                <button
                                    onClick={() => {
                                        setSupportOpen(false);
                                        setSupportSent(false);
                                        setSupportError('');
                                    }}
                                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    {supportSent ? 'Kapat' : 'Vazge\u00e7'}
                                </button>
                                {!supportSent && (
                                    <button
                                        disabled={
                                            supportSending ||
                                            !supportSubject.trim() ||
                                            !supportMessage.trim()
                                        }
                                        onClick={async () => {
                                            setSupportSending(true);
                                            setSupportError('');
                                            try {
                                                const res = await fetch(
                                                    'https://muhasebeasistani.com/api/support',
                                                    {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                        },
                                                        body: JSON.stringify({
                                                            email: currentUser?.email || '',
                                                            name: currentUser?.displayName || '',
                                                            subject: supportSubject,
                                                            message: supportMessage,
                                                        }),
                                                    }
                                                );
                                                if (res.ok) {
                                                    setSupportSent(true);
                                                    setSupportSubject('');
                                                    setSupportMessage('');
                                                } else {
                                                    const data = await res.json();
                                                    setSupportError(
                                                        data.error || 'G\u00f6nderilemedi'
                                                    );
                                                }
                                            } catch {
                                                setSupportError(
                                                    'Ba\u011flant\u0131 hatas\u0131. L\u00fctfen tekrar deneyin.'
                                                );
                                            } finally {
                                                setSupportSending(false);
                                            }
                                        }}
                                        className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                                    >
                                        {supportSending ? (
                                            <svg
                                                className="animate-spin h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                />
                                            </svg>
                                        ) : (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className="h-4 w-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                        )}
                                        {supportSending ? 'G\u00f6nderiliyor...' : 'G\u00f6nder'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Version + User Profile */}
                <div className="pt-3">
                    <button
                        onClick={() => setChangelogOpen(true)}
                        className="mx-auto mb-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                    >
                        <span>v{__APP_VERSION__}</span>
                    </button>
                    <div className="p-2 rounded-lg hover:bg-slate-800 transition-colors border-t border-slate-700 pt-3">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center font-bold text-white">
                                {currentUser?.displayName?.charAt(0).toUpperCase() ||
                                    currentUser?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                    {currentUser?.displayName}
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                    {currentUser?.email}
                                </p>
                            </div>
                            <button
                                onClick={handleRefreshLicense}
                                disabled={refreshingLicense}
                                title="Abonelik bilgilerini yenile"
                                className="text-slate-400 hover:text-sky-400 transition-colors disabled:opacity-40"
                            >
                                <RefreshIcon spinning={refreshingLicense} />
                            </button>
                            <button
                                onClick={handleLogout}
                                title="&#199;&#305;k&#305;&#351; Yap"
                                className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <LogoutIcon />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Changelog Modal */}
            {changelogOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
                    onClick={() => setChangelogOpen(false)}
                >
                    <div
                        className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">
                                De&#287;i&#351;iklik Ge&#231;mi&#351;i
                            </h3>
                            <button
                                onClick={() => setChangelogOpen(false)}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                Kapat
                            </button>
                        </div>
                        <div className="space-y-5">
                            {CHANGELOG.map((ver) => (
                                <div key={ver.version}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${ver.version === __APP_VERSION__ ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                                        >
                                            v{ver.version}
                                        </span>
                                        <span className="text-xs text-slate-500">{ver.date}</span>
                                    </div>
                                    <div className="space-y-1.5 text-sm text-slate-300 pl-1">
                                        {ver.entries.map((e, i) => (
                                            <div key={i} className="flex gap-2">
                                                <span
                                                    className={`${entryColor[e.type]} font-bold mt-0.5`}
                                                >
                                                    {e.type}
                                                </span>
                                                <span>{e.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
