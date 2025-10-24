
import React from 'react';
import { NavLink } from 'react-router-dom';

const BarChartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const WrenchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);


const Sidebar: React.FC = () => {
    const navLinkClasses = 'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200';
    const activeLinkClasses = 'bg-sky-500 text-white';
    const inactiveLinkClasses = 'text-slate-400 hover:bg-slate-700 hover:text-white';

    return (
        <div className="w-64 bg-slate-900 border-r border-slate-700 p-4 flex flex-col">
            <div className="text-2xl font-bold text-white mb-10 text-center">
                <span className="text-sky-400">MA</span> Kutu
            </div>
            <nav className="flex flex-col space-y-2">
                <NavLink 
                    to="/" 
                    end
                    className={({ isActive }) => `${navLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`}
                >
                    <BarChartIcon />
                    <span>Ana Panel</span>
                </NavLink>
                <NavLink 
                    to="/tools/statement-converter" 
                    className={({ isActive }) => `${navLinkClasses} ${isActive ? activeLinkClasses : inactiveLinkClasses}`}
                >
                    <WrenchIcon />
                    <span>Ekstre Dönüştürücü</span>
                </NavLink>
            </nav>
        </div>
    );
};

export default Sidebar;
