
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { loginSchema, validateForm } from '../../lib/validations';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { loginWithEmail } = useAuth();
    const navigate = useNavigate();

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError('');
        setErrors({});

        // Validate form data with Zod
        const result = validateForm(loginSchema, { email, password });

        if (!result.success) {
            setErrors((result as { success: false; errors: Record<string, string> }).errors);
            return;
        }

        setIsSubmitting(true);
        try {
            await loginWithEmail(result.data.email, result.data.password);
            navigate('/');
        } catch (err) {
            setSubmitError('Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Clear field error on change
    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
        if (errors.email) {
            setErrors((prev) => ({ ...prev, email: '' }));
        }
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(e.target.value);
        if (errors.password) {
            setErrors((prev) => ({ ...prev, password: '' }));
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 md:p-10">
                    <h2 className="text-3xl font-bold text-center text-white mb-2">Giriş Yap</h2>
                    <p className="text-center text-slate-400 mb-8">Hesabınıza erişim sağlayın</p>

                    {submitError && (
                        <div className="bg-red-500/20 text-red-400 text-sm text-center p-3 rounded-lg mb-6" role="alert">
                            {submitError}
                        </div>
                    )}

                    <form onSubmit={handleEmailLogin} className="space-y-6" noValidate>
                        <Input
                            id="email"
                            label="E-posta"
                            type="email"
                            value={email}
                            onChange={handleEmailChange}
                            placeholder="ornek@mail.com"
                            error={errors.email}
                            autoComplete="email"
                            disabled={isSubmitting}
                        />
                        <Input
                            id="password"
                            label="Şifre"
                            type="password"
                            value={password}
                            onChange={handlePasswordChange}
                            placeholder="••••••••"
                            error={errors.password}
                            autoComplete="current-password"
                            disabled={isSubmitting}
                        />

                        <Button type="submit" variant="primary" disabled={isSubmitting}>
                           {isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
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
