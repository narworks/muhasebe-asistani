import { useState, useEffect, useCallback } from 'react';
import type { UpgradeCTAState } from '../../types/electron';

const defaultState: UpgradeCTAState = {
    upgradeModal: { lastShownAt: null },
    winback: { shownAt: null },
    onboarding: {
        seenWelcomeAt: null,
        firstClientAddedAt: null,
        firstDiscoveryAt: null,
        completedAt: null,
        ahaPromptShownAt: null,
    },
};

/**
 * Trial → Paid upgrade CTA state hook (v1.9.15+).
 *
 * Renderer'da 3 katman modal'ın (TrialCountdownModal, AhaMomentPrompt,
 * WinbackModal) gösterim state'ini yönetir. IPC üzerinden main process'teki
 * settings.json'a yazar.
 */
export function useUpgradeCTA() {
    const [state, setState] = useState<UpgradeCTAState>(defaultState);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const loaded = await window.electronAPI.getUpgradeCTAState();
                if (mounted) setState(loaded);
            } catch (err) {
                console.error('[useUpgradeCTA] Failed to load state:', err);
            } finally {
                if (mounted) setIsLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const markUpgradeModalShown = useCallback(async () => {
        const timestamp = new Date().toISOString();
        setState((prev) => ({
            ...prev,
            upgradeModal: { lastShownAt: timestamp },
        }));
        try {
            await window.electronAPI.markUpgradeModalShown();
        } catch (err) {
            console.error('[useUpgradeCTA] Failed to mark upgrade modal shown:', err);
        }
    }, []);

    const markWinbackShown = useCallback(async () => {
        const timestamp = new Date().toISOString();
        setState((prev) => ({ ...prev, winback: { shownAt: timestamp } }));
        try {
            await window.electronAPI.markWinbackShown();
        } catch (err) {
            console.error('[useUpgradeCTA] Failed to mark winback shown:', err);
        }
    }, []);

    const markAhaPromptShown = useCallback(async () => {
        const timestamp = new Date().toISOString();
        setState((prev) => ({
            ...prev,
            onboarding: { ...prev.onboarding, ahaPromptShownAt: timestamp },
        }));
        try {
            await window.electronAPI.markAhaPromptShown();
        } catch (err) {
            console.error('[useUpgradeCTA] Failed to mark aha prompt shown:', err);
        }
    }, []);

    return { state, isLoading, markUpgradeModalShown, markWinbackShown, markAhaPromptShown };
}
