
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
);

const DashboardHome: React.FC = () => {
    const { currentUser } = useAuth();

    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Merhaba, <span className="text-sky-400">{currentUser?.displayName || currentUser?.email}</span>
            </h1>
            <p className="text-slate-400 text-lg mb-10">Araç kutunuzdaki araçlar aşağıda listelenmiştir.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Tool Card 1: Statement Converter */}
                <Link to="/tools/statement-converter" className="group">
                    <Card className="h-full flex flex-col justify-between border-2 border-transparent hover:border-sky-500 transition-colors duration-300">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">Banka Ekstresi Dönüştürücü</h2>
                            <p className="text-slate-400 mb-4">PDF, Excel ve TXT formatındaki banka ekstrelerinizi kolayca CSV formatına dönüştürün.</p>
                        </div>
                        <div className="flex items-center text-sky-400 font-semibold">
                            Aracı Kullan <ArrowRightIcon />
                        </div>
                    </Card>
                </Link>

                {/* Tool Card 2: E-Tebligat */}
                <Link to="/tools/e-tebligat" className="group">
                    <Card className="h-full flex flex-col justify-between border-2 border-transparent hover:border-sky-500 transition-colors duration-300">
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">E-Tebligat Kontrol</h2>
                            <p className="text-slate-400 mb-4">GİB E-Tebligat sisteminden tebligatlarınızı otomatik olarak sorgulayın ve görüntüleyin.</p>
                        </div>
                        <div className="flex items-center text-sky-400 font-semibold">
                            Aracı Kullan <ArrowRightIcon />
                        </div>
                    </Card>
                </Link>

                {/* --- MOCK TOOLS (COMING SOON) --- */}

                {/* Mock Tool 1: Invoice OCR */}
                <div className="cursor-not-allowed opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                    <Card className="h-full flex flex-col justify-between border border-slate-700">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-bold text-slate-300">Fiş/Fatura Okuyucu</h2>
                                <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full border border-yellow-500/30">YAKINDA</span>
                            </div>
                            <p className="text-slate-500 text-sm">Fiş ve faturalarınızın fotoğrafını çekin, yapay zeka verileri Excel'e aktarsın.</p>
                        </div>
                    </Card>
                </div>

                {/* Mock Tool 2: SGK Inquiry */}
                <div className="cursor-not-allowed opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                    <Card className="h-full flex flex-col justify-between border border-slate-700">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-bold text-slate-300">SGK Borç Sorgulama</h2>
                                <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full border border-yellow-500/30">YAKINDA</span>
                            </div>
                            <p className="text-slate-500 text-sm">İşveren SGK borçlarını otomatik sorgulayın ve takibini yapın.</p>
                        </div>
                    </Card>
                </div>

                {/* Mock Tool 3: Tax Calculator */}
                <div className="cursor-not-allowed opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                    <Card className="h-full flex flex-col justify-between border border-slate-700">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-bold text-slate-300">Vergi Asistanı</h2>
                                <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full border border-yellow-500/30">YAKINDA</span>
                            </div>
                            <p className="text-slate-500 text-sm">KDV, Gelir Vergisi hesaplamaları ve vergi mevzuatı hakkında sorular sorun.</p>
                        </div>
                    </Card>
                </div>

                {/* Mock Tool 4: Forex Rates */}
                <div className="cursor-not-allowed opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                    <Card className="h-full flex flex-col justify-between border border-slate-700">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-bold text-slate-300">TCMB Döviz Kuru</h2>
                                <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded-full border border-yellow-500/30">YAKINDA</span>
                            </div>
                            <p className="text-slate-500 text-sm">Geçmiş tarihli döviz kurlarını TCMB'den otomatik çekin ve raporlayın.</p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
