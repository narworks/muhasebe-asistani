import { useState, useEffect, useCallback } from 'react';
import type { OnboardingState } from '../../types/electron';

/**
 * Onboarding state hook.
 *
 * Renderer'da settings.onboarding'e IPC üzerinden erişim sağlar. Ana pencere
 * mount'ta state'i yükler, adım tamamlandığında server-side merge yapar.
 *
 * Kullanım:
 *   const { state, isLoading, markStep, resetAll } = useOnboarding();
 *   if (!state.seenWelcomeAt) { <WelcomeModal /> }
 *   await markStep('seenWelcome');
 */
export function useOnboarding() {
    const [state, setState] = useState<OnboardingState>({
        seenWelcomeAt: null,
        firstClientAddedAt: null,
        firstDiscoveryAt: null,
        completedAt: null,
    });
    const [isLoading, setIsLoading] = useState(true);

    // Initial load — settings.json'dan mevcut state'i çek
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const loaded = await window.electronAPI.getOnboardingState();
                if (mounted) setState(loaded);
            } catch (err) {
                console.error('[useOnboarding] Failed to load state:', err);
            } finally {
                if (mounted) setIsLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    /**
     * Bir onboarding adımını tamamlanmış olarak işaretle.
     * Server-side merge yapar, local state'i optimistic günceller.
     */
    const markStep = useCallback(
        async (stepName: 'seenWelcome' | 'firstClientAdded' | 'firstDiscovery' | 'completed') => {
            const timestamp = new Date().toISOString();
            const keyMap: Record<string, keyof OnboardingState> = {
                seenWelcome: 'seenWelcomeAt',
                firstClientAdded: 'firstClientAddedAt',
                firstDiscovery: 'firstDiscoveryAt',
                completed: 'completedAt',
            };
            const key = keyMap[stepName];
            // Optimistic local update
            setState((prev) => ({ ...prev, [key]: timestamp }));
            try {
                await window.electronAPI.markOnboardingStep(stepName);
            } catch (err) {
                console.error('[useOnboarding] Failed to mark step:', err);
            }
        },
        []
    );

    /**
     * Tüm onboarding state'ini sıfırla. Sidebar'daki "?" ikonu için —
     * kullanıcı rehberi tekrar görmek isterse.
     */
    const resetAll = useCallback(async () => {
        setState({
            seenWelcomeAt: null,
            firstClientAddedAt: null,
            firstDiscoveryAt: null,
            completedAt: null,
        });
        try {
            await window.electronAPI.markOnboardingStep('reset');
        } catch (err) {
            console.error('[useOnboarding] Failed to reset:', err);
        }
    }, []);

    return { state, isLoading, markStep, resetAll };
}
