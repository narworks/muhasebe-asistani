import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrialCountdownModal from '../components/upgrade/TrialCountdownModal';

describe('TrialCountdownModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: user is trial, 2 gün kaldı, hiç modal gösterilmemiş
        const twoDaysFromNow = new Date(Date.now() + 2 * 86_400_000).toISOString();
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: true,
            trialEndsAt: twoDaysFromNow,
        });
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        // @ts-expect-error mock
        window.electronAPI.markUpgradeModalShown.mockResolvedValue({ success: true });
    });

    it('trial son 3 gün + hiç gösterilmemiş → modal görünür', async () => {
        render(<TrialCountdownModal />);
        await waitFor(() =>
            expect(screen.getByText(/Deneme sürenizin bitmesine/)).toBeInTheDocument()
        );
        expect(screen.getByText(/6\.000₺\/yıl/)).toBeInTheDocument();
        expect(screen.getByText(/Aboneliğe Geç/)).toBeInTheDocument();
        expect(screen.getByText(/Daha Sonra/)).toBeInTheDocument();
    });

    it('trial değilse (paid user) → modal görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: false,
            isActive: true,
            trialEndsAt: null,
        });
        render(<TrialCountdownModal />);
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme sürenizin bitmesine/)).not.toBeInTheDocument();
    });

    it('trial ama > 3 gün kaldı → modal görünmez', async () => {
        const fiveDaysFromNow = new Date(Date.now() + 5 * 86_400_000).toISOString();
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: true,
            trialEndsAt: fiveDaysFromNow,
        });
        render(<TrialCountdownModal />);
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme sürenizin bitmesine/)).not.toBeInTheDocument();
    });

    it('24h içinde gösterilmiş → modal görünmez', async () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: oneHourAgo },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<TrialCountdownModal />);
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme sürenizin bitmesine/)).not.toBeInTheDocument();
    });

    it('24h+ önce gösterilmiş → modal tekrar görünür', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: twoDaysAgo },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<TrialCountdownModal />);
        await waitFor(() =>
            expect(screen.getByText(/Deneme sürenizin bitmesine/)).toBeInTheDocument()
        );
    });

    it('"Daha Sonra" butonuna basınca modal kapanır + markUpgradeModalShown çağrılır', async () => {
        render(<TrialCountdownModal />);
        await waitFor(() =>
            expect(screen.getByText(/Deneme sürenizin bitmesine/)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/Daha Sonra/));
        await waitFor(() => {
            expect(screen.queryByText(/Deneme sürenizin bitmesine/)).not.toBeInTheDocument();
            expect(window.electronAPI.markUpgradeModalShown).toHaveBeenCalledTimes(1);
        });
    });

    it('seenWelcomeAt null (WelcomeModal henüz görülmemiş) → modal görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: null,
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<TrialCountdownModal />);
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme sürenizin bitmesine/)).not.toBeInTheDocument();
    });

    it('İndirim/kupon dili YOK — metin içinde "%20", "indirim", "kupon" geçmemeli', async () => {
        render(<TrialCountdownModal />);
        await waitFor(() =>
            expect(screen.getByText(/Deneme sürenizin bitmesine/)).toBeInTheDocument()
        );
        expect(screen.queryByText(/%20/)).not.toBeInTheDocument();
        expect(screen.queryByText(/indirim/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/kupon/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/kod/i)).not.toBeInTheDocument();
    });
});
