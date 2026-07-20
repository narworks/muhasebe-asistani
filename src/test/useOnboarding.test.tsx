import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOnboarding } from '../components/onboarding/useOnboarding';

describe('useOnboarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("initial load — settings.json'dan state çeker", async () => {
        const mockState = {
            seenWelcomeAt: '2026-07-11T10:00:00Z',
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
        };
        // @ts-expect-error mock
        window.electronAPI.getOnboardingState.mockResolvedValue(mockState);

        const { result } = renderHook(() => useOnboarding());

        // Initial: isLoading = true, empty state
        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.state).toEqual(mockState);
    });

    it('markStep — optimistic update + IPC call', async () => {
        const initialState = {
            seenWelcomeAt: null,
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
        };
        // @ts-expect-error mock
        window.electronAPI.getOnboardingState.mockResolvedValue(initialState);
        // @ts-expect-error mock
        window.electronAPI.markOnboardingStep.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useOnboarding());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.markStep('seenWelcome');
        });

        // Optimistic update: seenWelcomeAt artık boş değil
        expect(result.current.state.seenWelcomeAt).not.toBeNull();
        expect(window.electronAPI.markOnboardingStep).toHaveBeenCalledWith('seenWelcome');
    });

    it("resetAll — state'i tüm null'lara sıfırlar + reset IPC", async () => {
        const initialState = {
            seenWelcomeAt: '2026-07-11T10:00:00Z',
            firstClientAddedAt: '2026-07-11T10:05:00Z',
            firstDiscoveryAt: '2026-07-11T10:10:00Z',
            completedAt: '2026-07-11T10:10:00Z',
        };
        // @ts-expect-error mock
        window.electronAPI.getOnboardingState.mockResolvedValue(initialState);
        // @ts-expect-error mock
        window.electronAPI.markOnboardingStep.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useOnboarding());

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.state.seenWelcomeAt).not.toBeNull();

        await act(async () => {
            await result.current.resetAll();
        });

        expect(result.current.state).toEqual({
            seenWelcomeAt: null,
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
            ahaPromptShownAt: null,
        });
        expect(window.electronAPI.markOnboardingStep).toHaveBeenCalledWith('reset');
    });

    it('IPC hata verirse silent fallback — state korunur', async () => {
        // @ts-expect-error mock
        window.electronAPI.getOnboardingState.mockRejectedValue(new Error('IPC failed'));

        const { result } = renderHook(() => useOnboarding());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // Fallback: default state (hepsi null)
        expect(result.current.state).toEqual({
            seenWelcomeAt: null,
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
            ahaPromptShownAt: null,
        });
    });

    it('markStep IPC fail olsa bile local state optimistic günceller', async () => {
        // @ts-expect-error mock
        window.electronAPI.getOnboardingState.mockResolvedValue({
            seenWelcomeAt: null,
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
        });
        // @ts-expect-error mock
        window.electronAPI.markOnboardingStep.mockRejectedValue(new Error('IPC fail'));

        const { result } = renderHook(() => useOnboarding());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.markStep('firstClientAdded');
        });

        // Local state optimistic güncellendi
        expect(result.current.state.firstClientAddedAt).not.toBeNull();
    });
});
