import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import UpdateBanner from '../UpdateBanner';
import TrialBanner from '../TrialBanner';

const MainLayout: React.FC = () => {
    return (
        <div className="flex h-screen bg-slate-900 text-white">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <TrialBanner />
                <Navbar />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-800 p-6 md:p-8">
                    <Outlet />
                </main>
            </div>
            <UpdateBanner />
        </div>
    );
};

export default MainLayout;
