import React, { useState, useEffect } from 'react';

interface Tebligat {
    date: string;
    sender: string;
    subject: string;
    status: string;
}

const ETebligat: React.FC = () => {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [captchaImage, setCaptchaImage] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [captchaInput, setCaptchaInput] = useState('');
    const [autoLogin, setAutoLogin] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tebligatlar, setTebligatlar] = useState<Tebligat[] | null>(null);

    const initSession = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('http://localhost:3001/api/gib/init');
            if (!response.ok) throw new Error('Oturum başlatılamadı');
            const data = await response.json();
            setSessionId(data.sessionId);
            setCaptchaImage(data.captchaBase64);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        initSession();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionId) return;

        setLoading(true);
        setError(null);
        try {
            const response = await fetch('http://localhost:3001/api/gib/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    username,
                    password,
                    captcha: autoLogin ? '' : captchaInput
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Giriş başarısız');
            }

            setTebligatlar(result.data);
        } catch (err: any) {
            setError(err.message);
            // Refresh captcha on error as it might be invalid now
            // initSession(); // Optional: might want to let user decide or auto-refresh
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">GİB E-Tebligat Sorgulama</h1>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            {!tebligatlar ? (
                <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto">
                    <h2 className="text-lg font-semibold mb-4">GİB Giriş</h2>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Kullanıcı Kodu / TCKN</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">İnternet Vergi Dairesi Şifresi</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                required
                            />
                        </div>

                        <div className="flex items-center mb-4 bg-indigo-50 p-3 rounded-md border border-indigo-100">
                            <input
                                id="auto-login"
                                type="checkbox"
                                checked={autoLogin}
                                onChange={(e) => setAutoLogin(e.target.checked)}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="auto-login" className="ml-2 block text-sm text-indigo-900 font-medium cursor-pointer">
                                🤖 Otomatik Giriş (Yapay Zeka ile Captcha Çöz)
                            </label>
                        </div>

                        {!autoLogin && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Doğrulama Kodu</label>
                                <div className="flex items-center space-x-4 mt-1">
                                    {captchaImage ? (
                                        <img src={captchaImage} alt="Captcha" className="h-12 border rounded" />
                                    ) : (
                                        <div className="h-12 w-32 bg-gray-200 animate-pulse rounded"></div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={initSession}
                                        className="text-sm text-indigo-600 hover:text-indigo-800"
                                    >
                                        Yenile
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={captchaInput}
                                    onChange={(e) => setCaptchaInput(e.target.value)}
                                    className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                    placeholder="Resimdeki kodu giriniz"
                                    required={!autoLogin}
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !sessionId}
                            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? 'İşleniyor...' : 'Sorgula'}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="bg-white p-6 rounded-lg shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">Tebligat Listesi</h2>
                        <button
                            onClick={() => { setTebligatlar(null); setPassword(''); setCaptchaInput(''); initSession(); }}
                            className="text-sm text-gray-600 hover:text-gray-900 border px-3 py-1 rounded"
                        >
                            Yeni Sorgu
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gönderen</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Konu</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {tebligatlar.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-4 text-center text-gray-500">Tebligat bulunamadı.</td>
                                    </tr>
                                ) : (
                                    tebligatlar.map((item, index) => (
                                        <tr key={index}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.date}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.sender}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.subject}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.status.includes('Okun') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ETebligat;
