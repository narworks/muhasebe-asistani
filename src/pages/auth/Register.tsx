import React from 'react';
import { Link } from 'react-router-dom';

const Register: React.FC = () => {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 md:p-10 text-center">
                    <h2 className="text-3xl font-bold text-white mb-2">Hesap Oluştur</h2>
                    <p className="text-slate-400 mb-8">Kayıt işlemleri web sitemiz üzerinden yapılmaktadır.</p>

                    <a
                        href="https://benimsaas.com/register"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mb-6"
                    >
                        Web Sitesine Git
                    </a>

                    <p className="text-sm text-slate-400">
                        Zaten hesabınız var mı?{' '}
                        <Link to="/login" className="font-medium text-sky-400 hover:text-sky-300">
                            Giriş Yapın
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;