
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { loginWithEmail } = useAuth();
    const navigate = useNavigate();

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await loginWithEmail(email, password);
            navigate('/');
        } catch (err) {
            setError('Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 md:p-10">
                    <h2 className="text-3xl font-bold text-center text-white mb-2">Giriş Yap</h2>
                    <p className="text-center text-slate-400 mb-8">Hesabınıza erişim sağlayın</p>

                    {error && <p className="bg-red-500/20 text-red-400 text-sm text-center p-3 rounded-lg mb-6">{error}</p>}
                    
                    <form onSubmit={handleEmailLogin} className="space-y-6">
                        <Input id="email" label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" required />
                        <Input id="password" label="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                        
                        <Button type="submit" variant="primary">
                           Giriş Yap
                        </Button>
                    </form>

                    <p className="text-center text-sm text-slate-400 mt-8">
                        Hesabınız yok mu?{' '}
                        <Link to="/register" className="font-medium text-sky-400 hover:text-sky-300">
                            Kayıt Olun
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
