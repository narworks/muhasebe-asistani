import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import UpdateBanner from '../UpdateBanner';
import TrialBanner from '../TrialBanner';
import WelcomeModal from '../onboarding/WelcomeModal';
import { useOnboarding } from '../onboarding/useOnboarding';
import type { Subscription } from '../../types';

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const { state: onboarding, isLoading: onboardingLoading, markStep } = useOnboarding();
    const [subscription, setSubscription] = useState<Subscription | null>(null);

    // Subscription state — WelcomeModal'da trial gün sayısını göstermek için
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const status = await window.electronAPI.getSubscriptionStatus();
                if (!cancelled) setSubscription(status);
            } catch {
                /* silent */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const isTrial = !!subscription?.isTrial;
    const trialDaysLeft = subscription?.trialEndsAt
        ? Math.max(
              0,
              Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)
          )
        : undefined;

    // İlk açılışta modal göster — onboarding state'i yüklendi + seenWelcomeAt yok
    const showWelcome = !onboardingLoading && !onboarding.seenWelcomeAt;

    const handleWelcomeClose = async () => {
        await markStep('seenWelcome');
    };

    const handleWelcomeStart = async () => {
        await markStep('seenWelcome');
        navigate('/tools/e-tebligat');
    };

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
            {showWelcome && (
                <WelcomeModal
                    isTrial={isTrial}
                    trialDaysLeft={trialDaysLeft}
                    onClose={handleWelcomeClose}
                    onStart={handleWelcomeStart}
                />
            )}
        </div>
    );
};

export default MainLayout;
