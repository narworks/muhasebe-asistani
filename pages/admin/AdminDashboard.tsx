import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';

interface UserData {
    userId: string;
    balance: number;
    email: string;
}

const AdminDashboard: React.FC = () => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [stats, setStats] = useState<{ totalUsers: number; totalCredits: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [creditAmount, setCreditAmount] = useState<number>(0);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, statsRes] = await Promise.all([
                fetch('http://localhost:3001/api/admin/users'),
                fetch('http://localhost:3001/api/admin/stats')
            ]);

            const usersData = await usersRes.json();
            const statsData = await statsRes.json();

            setUsers(usersData);
            setStats(statsData);
        } catch (error) {
            console.error("Admin data fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUpdateCredit = async (action: 'add' | 'set') => {
        if (!selectedUser) return;

        try {
            const res = await fetch('http://localhost:3001/api/admin/credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser, amount: creditAmount, action })
            });

            if (res.ok) {
                alert('Kredi güncellendi!');
                setCreditAmount(0);
                fetchData(); // Refresh data
            } else {
                alert('Hata oluştu.');
            }
        } catch (error) {
            console.error("Credit update error:", error);
        }
    };

    if (loading) return <div className="text-white p-8">Yükleniyor...</div>;

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-white mb-8">Yönetici Paneli</h1>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <Card className="bg-slate-800 border-l-4 border-sky-500">
                    <h3 className="text-slate-400 text-sm uppercase">Toplam Kullanıcı</h3>
                    <p className="text-4xl font-bold text-white mt-2">{stats?.totalUsers}</p>
                </Card>
                <Card className="bg-slate-800 border-l-4 border-emerald-500">
                    <h3 className="text-slate-400 text-sm uppercase">Toplam Dağıtılan Kredi</h3>
                    <p className="text-4xl font-bold text-white mt-2">{stats?.totalCredits}</p>
                </Card>
            </div>

            {/* Credit Management */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User List */}
                <div className="lg:col-span-2">
                    <Card>
                        <h2 className="text-xl font-bold text-white mb-4">Kullanıcı Listesi</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-slate-300">
                                <thead className="text-xs uppercase bg-slate-700 text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">User ID</th>
                                        <th className="px-4 py-3">Email</th>
                                        <th className="px-4 py-3 text-right">Bakiye</th>
                                        <th className="px-4 py-3 text-center">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {users.map(user => (
                                        <tr key={user.userId} className="hover:bg-slate-700/50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs">{user.userId}</td>
                                            <td className="px-4 py-3">{user.email}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-400">{user.balance}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setSelectedUser(user.userId)}
                                                    className="text-sky-400 hover:text-sky-300 text-sm underline"
                                                >
                                                    Seç
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                {/* Action Panel */}
                <div>
                    <Card className="sticky top-6">
                        <h2 className="text-xl font-bold text-white mb-4">Kredi Yönetimi</h2>
                        {selectedUser ? (
                            <div className="space-y-4">
                                <div className="bg-slate-900 p-3 rounded text-sm">
                                    <p className="text-slate-400">Seçili Kullanıcı:</p>
                                    <p className="text-white font-mono break-all">{selectedUser}</p>
                                </div>

                                <div>
                                    <label className="block text-slate-400 text-sm mb-1">Miktar</label>
                                    <input
                                        type="number"
                                        value={creditAmount}
                                        onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-white focus:outline-none focus:border-sky-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleUpdateCredit('add')}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded font-semibold transition-colors"
                                    >
                                        Ekle (+)
                                    </button>
                                    <button
                                        onClick={() => handleUpdateCredit('set')}
                                        className="bg-sky-600 hover:bg-sky-700 text-white py-2 rounded font-semibold transition-colors"
                                    >
                                        Ayarla (=)
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-slate-500 text-center py-8">İşlem yapmak için listeden bir kullanıcı seçin.</p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
