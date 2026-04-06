import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';

const ArrowRightIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 5l7 7m0 0l-7 7m7-7H3"
        />
    </svg>
);

const LockIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 ml-2"
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

const DashboardHome: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [modules, setModules] = useState<string[]>([]);
    const [isTrial, setIsTrial] = useState(false);

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
        const interval = setInterval(fetchModules, 5000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const hasModule = (id: string) => isTrial || modules.includes(id);

    const tools = [
        {
            id: 'excel_assistant',
            name: 'Excel Asistanı',
            description:
                'Ne yapmasını istediğinizi yazın, gerisini o halletsin. Excel, CSV ve PDF dosyalarınızı dönüştürün.',
            path: '/tools/statement-converter',
        },
        {
            id: 'e_tebligat',
            name: 'E-Tebligat Kontrol',
            description:
                'GİB E-Tebligat sisteminden tebligatlarınızı otomatik olarak sorgulayın ve görüntüleyin.',
            path: '/tools/e-tebligat',
        },
    ];

    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Merhaba,{' '}
                <span className="text-sky-400">
                    {currentUser?.displayName || currentUser?.email}
                </span>
            </h1>
            <p className="text-slate-400 text-lg mb-10">
                Ara&#231; kutunuzdaki ara&#231;lar a&#351;a&#287;&#305;da listenmi&#351;tir.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {tools.map((tool) =>
                    hasModule(tool.id) ? (
                        <Link key={tool.id} to={tool.path} className="group">
                            <Card className="h-full flex flex-col justify-between border-2 border-transparent hover:border-sky-500 transition-colors duration-300">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">
                                        {tool.name}
                                    </h2>
                                    <p className="text-slate-400 mb-4">{tool.description}</p>
                                </div>
                                <div className="flex items-center text-sky-400 font-semibold">
                                    Arac&#305; Kullan <ArrowRightIcon />
                                </div>
                            </Card>
                        </Link>
                    ) : (
                        <button
                            key={tool.id}
                            onClick={() => navigate('/subscription')}
                            className="text-left group"
                        >
                            <Card className="h-full flex flex-col justify-between border-2 border-transparent hover:border-slate-600 transition-colors duration-300 opacity-60">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">
                                        {tool.name}
                                    </h2>
                                    <p className="text-slate-400 mb-4">{tool.description}</p>
                                </div>
                                <div className="flex items-center text-slate-500 font-semibold">
                                    Abonelik Gerekli <LockIcon />
                                </div>
                            </Card>
                        </button>
                    )
                )}
            </div>
        </div>
    );
};

export default DashboardHome;
