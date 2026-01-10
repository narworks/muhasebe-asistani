import React from 'react';
import Card from '../../components/ui/Card';

const AdminDashboard: React.FC = () => {
    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-white mb-8">Yönetici Paneli</h1>
            <Card>
                <div className="text-center py-10">
                    <p className="text-slate-400 text-lg">
                        Bu özellik masaüstü versiyonda devre dışı bırakılmıştır.
                    </p>
                    <p className="text-slate-500 text-sm mt-2">
                        Kullanıcı ve kredi yönetimi için bulut panelini kullanınız.
                    </p>
                </div>
            </Card>
        </div>
    );
};

export default AdminDashboard;
