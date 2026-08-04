import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WinbackModal from '../components/upgrade/WinbackModal';

describe('WinbackModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: trial expired, hiç winback gösterilmemiş
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: false,
            status: 'expired',
            trialEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
            trialEndReason: 'expired',
        });
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null, count: 0 },
            onboarding: {
                seenWelcomeAt: '2026-07-01T10:00:00Z',
                firstClientAddedAt: '2026-07-01T10:05:00Z',
                firstDiscoveryAt: '2026-07-01T10:10:00Z',
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        // @ts-expect-error mock
        window.electronAPI.getScanHistory.mockResolvedValue([{}, {}, {}, {}, {}]); // 5 scan
        // @ts-expect-error mock
        window.electronAPI.getClients.mockResolvedValue([{}, {}, {}]); // 3 client
        // @ts-expect-error mock
        window.electronAPI.markWinbackShown.mockResolvedValue({ success: true });
    });

    it('trial expired + hiç gösterilmemiş → modal görünür', async () => {
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
    });

    it('istatistikler doğru gösteriliyor (5 scan → 15 dk kabaca 0 saat, 3 mük)', async () => {
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        expect(screen.getByText(/5 tarama/)).toBeInTheDocument();
        expect(screen.getByText(/3 mükellef/)).toBeInTheDocument();
    });

    it('client-side expiry (status expired değil ama trialEndsAt geçmiş) → modal görünür', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: false,
            status: 'active', // cron henüz expired yapmadı
            trialEndsAt: new Date(Date.now() - 86_400_000).toISOString(), // dün doldu
        });
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
    });

    it('son 7 gün içinde gösterildi → modal görünmez (cooldown)', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), count: 1 },
            onboarding: {
                seenWelcomeAt: null,
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<WinbackModal />);
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme süreniz doldu/)).not.toBeInTheDocument();
    });

    it('7 günden eski + count<3 → modal tekrar görünür', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: new Date(Date.now() - 8 * 86_400_000).toISOString(), count: 1 },
            onboarding: {
                seenWelcomeAt: null,
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
    });

    it('count >= 3 → modal görünmez (max 3 gösterim)', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), count: 3 },
            onboarding: {
                seenWelcomeAt: null,
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        render(<WinbackModal />);
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme süreniz doldu/)).not.toBeInTheDocument();
    });

    it('trial aktif (expired değil) → modal görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: true,
            status: 'active',
            trialEndReason: null,
        });
        render(<WinbackModal />);
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme süreniz doldu/)).not.toBeInTheDocument();
    });

    it('paid user (is_trial false) → modal görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: false,
            isActive: true,
            status: 'active',
        });
        render(<WinbackModal />);
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(screen.queryByText(/Deneme süreniz doldu/)).not.toBeInTheDocument();
    });

    it('0 tarama → "0 tarama" gösterilir ama "saat tasarruf" satırı gizlenir', async () => {
        // @ts-expect-error mock
        window.electronAPI.getScanHistory.mockResolvedValue([]);
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        expect(screen.getByText(/0 tarama/)).toBeInTheDocument();
        expect(screen.queryByText(/saat tasarruf/)).not.toBeInTheDocument();
    });

    it('"Şimdi Değil" butonuna basınca markWinbackShown çağrılır', async () => {
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        fireEvent.click(screen.getByText(/Şimdi Değil/));
        await waitFor(() => {
            expect(window.electronAPI.markWinbackShown).toHaveBeenCalledTimes(1);
        });
    });

    it('İndirim / kod / kupon dili YOK', async () => {
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        expect(screen.queryByText(/indirim/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/%\d+/)).not.toBeInTheDocument();
        expect(screen.queryByText(/kupon/i)).not.toBeInTheDocument();
    });

    it('metin: 200 mükellef, 5.000 kredi, 6.000₺/yıl geçer', async () => {
        render(<WinbackModal />);
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        expect(screen.getByText(/200 mükellef/)).toBeInTheDocument();
        expect(screen.getByText(/5\.000 kredi/)).toBeInTheDocument();
        expect(screen.getByText(/6\.000₺\/yıl/)).toBeInTheDocument();
    });
});
