
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const GoogleIcon = () => (
    <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.244,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
    </svg>
);

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { loginWithEmail, loginWithGoogle } = useAuth();
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
    
    const handleGoogleLogin = async () => {
        setError('');
        try {
            await loginWithGoogle();
            navigate('/');
        } catch (err) {
            setError('Google ile giriş yapılamadı.');
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
                    
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-slate-800 px-2 text-slate-400">veya</span>
                        </div>
                    </div>

                    <Button variant="google" onClick={handleGoogleLogin}>
                        <GoogleIcon />
                        Google ile Giriş Yap
                    </Button>
                    
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
