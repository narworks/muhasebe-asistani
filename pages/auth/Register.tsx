
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const Register: React.FC = () => {
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const { registerWithEmail } = useAuth();
    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            return setError('Şifreler uyuşmuyor.');
        }
        if (displayName.trim() === '') {
            return setError('Görünen ad boş bırakılamaz.');
        }
        setError('');
        try {
            await registerWithEmail(email, password, displayName);
            navigate('/');
        } catch (err) {
            setError('Hesap oluşturulamadı. Lütfen tekrar deneyin.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 md:p-10">
                    <h2 className="text-3xl font-bold text-center text-white mb-2">Hesap Oluştur</h2>
                    <p className="text-center text-slate-400 mb-8">Yeni bir hesapla başlayın</p>

                    {error && <p className="bg-red-500/20 text-red-400 text-sm text-center p-3 rounded-lg mb-6">{error}</p>}
                    
                    <form onSubmit={handleRegister} className="space-y-6">
                        <Input id="displayName" label="Görünen Ad" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Adınız Soyadınız" required />
                        <Input id="email" label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" required />
                        <Input id="password" label="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                        <Input id="confirm-password" label="Şifreyi Onayla" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                        
                        <Button type="submit" variant="primary">
                           Kayıt Ol
                        </Button>
                    </form>
                                        
                    <p className="text-center text-sm text-slate-400 mt-8">
                        Zaten bir hesabınız var mı?{' '}
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