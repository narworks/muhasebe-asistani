import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AhaMomentPrompt from '../components/upgrade/AhaMomentPrompt';

describe('AhaMomentPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // shouldAdvanceTime: waitFor()'un iç polling'i (setTimeout tabanlı) fake
        // clock'u da gerçek zamanla birlikte ilerletsin — aksi halde waitFor hiç
        // resolve olmadan gerçek 5000ms test timeout'una çarpar.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: true,
        });
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: '2026-07-11T10:05:00Z',
                firstDiscoveryAt: '2026-07-11T10:10:00Z',
                completedAt: null,
                ahaPromptShownAt: null,
            },
        });
        // @ts-expect-error mock
        window.electronAPI.markAhaPromptShown.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('firstDiscoveryAt SET + trial + hiç gösterilmemiş → 5sn sonra prompt görünür', async () => {
        render(<AhaMomentPrompt firstDiscoveryDurationMs={12000} />);
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        // 5sn öncesi görünmez
        expect(screen.queryByText(/İlk taraman/)).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        await waitFor(() => expect(screen.getByText(/İlk taraman/)).toBeInTheDocument());
    });

    it('ahaPromptShownAt SET → prompt görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: '2026-07-11T10:05:00Z',
                firstDiscoveryAt: '2026-07-11T10:10:00Z',
                completedAt: null,
                ahaPromptShownAt: '2026-07-11T10:11:00Z',
            },
        });
        render(<AhaMomentPrompt firstDiscoveryDurationMs={12000} />);
        act(() => vi.advanceTimersByTime(5000));
        await waitFor(() => expect(window.electronAPI.getUpgradeCTAState).toHaveBeenCalled());
        expect(screen.queryByText(/İlk taraman/)).not.toBeInTheDocument();
    });

    it('trial değilse (paid) → prompt görünmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: false,
            isActive: true,
        });
        render(<AhaMomentPrompt firstDiscoveryDurationMs={12000} />);
        act(() => vi.advanceTimersByTime(5000));
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(screen.queryByText(/İlk taraman/)).not.toBeInTheDocument();
    });

    it('Aha metni: 20 mük, 500 kredi, 200 mük, 5.000 kredi, 6.000₺/yıl geçer', async () => {
        render(<AhaMomentPrompt firstDiscoveryDurationMs={15000} />);
        act(() => vi.advanceTimersByTime(5000));
        await waitFor(() => expect(screen.getByText(/İlk taraman/)).toBeInTheDocument());
        expect(screen.getByText(/20 mükellef/)).toBeInTheDocument();
        expect(screen.getByText(/500 kredi/)).toBeInTheDocument();
        expect(screen.getByText(/200 mükellef/)).toBeInTheDocument();
        expect(screen.getByText(/5\.000 kredi/)).toBeInTheDocument();
        expect(screen.getByText(/6\.000₺\/yıl/)).toBeInTheDocument();
    });

    it('İndirim dili YOK', async () => {
        render(<AhaMomentPrompt firstDiscoveryDurationMs={12000} />);
        act(() => vi.advanceTimersByTime(5000));
        await waitFor(() => expect(screen.getByText(/İlk taraman/)).toBeInTheDocument());
        expect(screen.queryByText(/indirim/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/%20/)).not.toBeInTheDocument();
    });

    it('Kapat butonuna basınca markAhaPromptShown çağrılır', async () => {
        render(<AhaMomentPrompt firstDiscoveryDurationMs={12000} />);
        act(() => vi.advanceTimersByTime(5000));
        await waitFor(() => expect(screen.getByText(/İlk taraman/)).toBeInTheDocument());
        fireEvent.click(screen.getByText(/Kapat/));
        await waitFor(() => {
            expect(window.electronAPI.markAhaPromptShown).toHaveBeenCalledTimes(1);
        });
    });
});
