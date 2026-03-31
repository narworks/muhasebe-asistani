import React, { useState } from 'react';

interface Props {
    onAccept: () => void;
    onDecline: () => void;
}

const LegalConsentModal: React.FC<Props> = ({ onAccept, onDecline }) => {
    const [agreed, setAgreed] = useState(false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 w-[560px] max-h-[80vh] overflow-y-auto shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">
                    Kullanim Kosullari ve Gizlilik
                </h2>

                <div className="text-sm text-slate-300 space-y-4 mb-6">
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">Veri Saklama ve Gizlilik</h3>
                        <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                            <li>
                                Mukellef bilgileriniz (vergi numarasi, GIB kullanici kodu, sifre
                                vb.){' '}
                                <span className="text-white font-medium">
                                    yalnizca sizin bilgisayarinizda
                                </span>{' '}
                                sifrelenerek saklanir.
                            </li>
                            <li>
                                NarWorks bu bilgilere{' '}
                                <span className="text-white font-medium">
                                    hicbir sekilde erismez
                                </span>
                                , gormez ve islemez.
                            </li>
                            <li>
                                Verileriniz ucuncu kisilerle paylasilmaz ve sunucularimizda
                                depolanmaz.
                            </li>
                        </ul>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">Sorumluluk</h3>
                        <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                            <li>
                                Mukellef bilgilerinin korunmasi, yedeklenmesi ve guvenli saklanmasi{' '}
                                <span className="text-white font-medium">
                                    tamamen sizin sorumlulugununuzdadir
                                </span>
                                .
                            </li>
                            <li>
                                Bilgisayariniza yetkisiz erisim sonucu olusabilecek veri kaybi veya
                                sizintilarindan NarWorks sorumlu tutulamaz.
                            </li>
                            <li>
                                GIB portali sifre ve kimlik bilgilerini uygulamaya girerek, bu
                                bilgilerin otomatik sorgulama amaciyla kullanilmasina onay vermis
                                olursunuz.
                            </li>
                        </ul>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <h3 className="font-semibold text-white mb-2">KVKK Bilgilendirmesi</h3>
                        <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                            <li>
                                6698 sayili Kisisel Verilerin Korunmasi Kanunu kapsaminda, kisisel
                                verileriniz cihazinizda yerel olarak islenir.
                            </li>
                            <li>
                                Uygulama yalnizca abonelik dogrulamasi icin bulut sunucusuyla
                                iletisim kurar; mukellef verileri bu iletisime dahil degildir.
                            </li>
                        </ul>
                    </div>
                </div>

                <label className="flex items-start gap-3 mb-6 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-300">
                        Yukaridaki kosullari okudum, anladim ve kabul ediyorum.
                    </span>
                </label>

                <div className="flex gap-3">
                    <button
                        onClick={onDecline}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-slate-700 hover:bg-slate-600 transition-colors"
                    >
                        Kabul Etmiyorum
                    </button>
                    <button
                        onClick={onAccept}
                        disabled={!agreed}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Kabul Ediyorum
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LegalConsentModal;
