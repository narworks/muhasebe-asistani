
import React from 'react';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';

const Account: React.FC = () => {
    const { currentUser } = useAuth();
    
    return (
        <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Hesap Ayarları</h1>
            <Card className="max-w-lg">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-slate-400 font-semibold">Görünen Ad</h3>
                        <p className="text-white text-lg">{currentUser?.displayName || 'N/A'}</p>
                    </div>
                     <div>
                        <h3 className="text-slate-400 font-semibold">E-posta</h3>
                        <p className="text-white text-lg">{currentUser?.email}</p>
                    </div>
                     <div>
                        <h3 className="text-slate-400 font-semibold">Kullanıcı ID</h3>
                        <p className="text-white text-sm font-mono">{currentUser?.uid}</p>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Account;
