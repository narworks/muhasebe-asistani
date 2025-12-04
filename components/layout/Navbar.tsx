
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import CreditModal from '../CreditModal';

const Navbar: React.FC = () => {
    const { currentUser } = useAuth();
    const [credits, setCredits] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchCredits = async () => {
            if (currentUser?.uid) {
                try {
                    const response = await fetch(`http://localhost:3001/api/credits/${currentUser.uid}`);
                    const data = await response.json();
                    setCredits(data.balance);
                } catch (error) {
                    console.error("Error fetching credits:", error);
                }
            }
        };

        fetchCredits();

        // Optional: Set up an interval to refresh credits periodically
        const intervalId = setInterval(fetchCredits, 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId);

    }, [currentUser]);

    return (
        <>
            <header className="h-16 bg-slate-900 flex items-center justify-end px-6 border-b border-slate-700 space-x-4">
                {credits !== null && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-700 hover:border-sky-500 transition-all cursor-pointer group"
                    >
                        <span className="text-xs text-slate-400 group-hover:text-white transition-colors uppercase font-bold tracking-wider">Kredi:</span>
                        <span className="text-emerald-400 font-bold font-mono">{credits}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>
                )}
            </header>

            <CreditModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                currentCredits={credits || 0}
                currentUserEmail={currentUser?.email || ''}
            />
        </>
    );
};

export default Navbar;