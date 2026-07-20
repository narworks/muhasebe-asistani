import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUpgradeCTA } from '../components/upgrade/useUpgradeCTA';

describe('useUpgradeCTA', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("initial load — settings'ten upgrade CTA state'i çeker", async () => {
        const mockState = {
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
            onboarding: {
                seenWelcomeAt: '2026-07-11T10:00:00Z',
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
                ahaPromptShownAt: null,
            },
        };
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue(mockState);

        const { result } = renderHook(() => useUpgradeCTA());
        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.state).toEqual(mockState);
    });

    it('markUpgradeModalShown — optimistic update + IPC çağrısı yapar', async () => {
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
        // @ts-expect-error mock
        window.electronAPI.markUpgradeModalShown.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useUpgradeCTA());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.markUpgradeModalShown();
        });

        expect(result.current.state.upgradeModal.lastShownAt).not.toBeNull();
        expect(window.electronAPI.markUpgradeModalShown).toHaveBeenCalledTimes(1);
    });

    it('markAhaPromptShown — onboarding.ahaPromptShownAt işaretler', async () => {
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
        // @ts-expect-error mock
        window.electronAPI.markAhaPromptShown.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useUpgradeCTA());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.markAhaPromptShown();
        });

        expect(result.current.state.onboarding.ahaPromptShownAt).not.toBeNull();
    });

    it('IPC hata verirse silent fallback — state korunur', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockRejectedValue(new Error('IPC failed'));

        const { result } = renderHook(() => useUpgradeCTA());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.state.upgradeModal.lastShownAt).toBeNull();
        expect(result.current.state.winback.shownAt).toBeNull();
    });
});
