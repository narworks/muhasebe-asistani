# Trial → Paid Conversion Boost v1.9.15 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trial kullanıcılarını 3 kritik anda (son 3 gün + ilk başarı sonrası + trial expired sonrası) upgrade CTA modal'ları ile ödemeli plana yönlendir.

**Architecture:** Katman-bazlı yaklaşım. Her katman = 1 modal component + settings state field + tetikleyici koşul. Backend değişiklikleri v1.9.14'te oluşturulan `settings.onboarding.*` + IPC pattern'ini genişletir. Renderer tarafında hepsi App.tsx / MainLayout altında koşullu render.

**Tech Stack:** Electron 35 (main) + React 18 + TypeScript + Vite. Vitest + @testing-library/react test için. Settings JSON file persist. IPC over preload bridge.

**Spec:** `docs/specs/2026-07-17-trial-conversion-boost.md`

## Global Constraints

Aşağıdaki kurallar TÜM task'lar için implicit geçerlidir:

- **Ürün gerçek özellikleri (KAYNAKTAN):** Trial = 20 mükellef + 500 kredi/ay · Pro Paid = 200 mükellef + 5.000 kredi/ay · Tam Paket = 6.000₺/yıl (Excel Asistanı + E-Tebligat Kontrol). Metinlerde bu değerler dışında sayı YASAK.
- **İndirim/kupon/promosyon YOK.** Ne %20, ne "sınırlı süre", ne WINBACK15 tarzı kod. Aciliyet için sadece gerçek kayıp bilinci kullan ("trial bittikten sonra mükellef listenize erişim durur").
- **UI dili Türkçe.** Kod içi comment'ler + variable isimleri İngilizce, kullanıcıya görünen tüm metinler Türkçe.
- **Formatting:** Prettier (4-space, single quote, trailing commas es5, 100 char). Husky pre-commit lint+prettier otomatik çalışır.
- **Test coverage:** Her yeni component için Vitest test dosyası (`src/test/<Component>.test.tsx`). Hooks için ayrı test.
- **Type-check:** `npm run type-check` her task sonunda temiz olmalı (0 error).
- **Kredi tükenmiş user işaret:** İçerik yazılırken `credit_balances.monthly_credits_used` "kalan" değil, "kullanılan"dır. UI'da "500/500" = KALAN/TOPLAM format kullanılıyor (mevcut convention). Yeni metin yazarken bu convention'ı bozma.

---

## File Structure

```
main/
├── settings.js             (MODIFY: add upgradeModal + winback state groups + helpers)
├── preload.js              (MODIFY: expose 6 new IPC methods)
├── main.js                 (MODIFY: register 6 new ipcMain.handle)

src/
├── types/electron.d.ts     (MODIFY: add UpgradeModalState + WinbackState types + IElectronAPI methods)
├── components/upgrade/
│   ├── useUpgradeCTA.ts    (CREATE: custom hook, mirrors useOnboarding pattern)
│   ├── TrialCountdownModal.tsx    (CREATE: Katman 1)
│   ├── AhaMomentPrompt.tsx        (CREATE: Katman 2)
│   └── WinbackModal.tsx           (CREATE: Katman 3)
├── App.tsx                 (MODIFY: render TrialCountdownModal + WinbackModal)
├── pages/tools/ETebligat.tsx (MODIFY: render AhaMomentPrompt after firstDiscoveryAt)
└── test/
    ├── useUpgradeCTA.test.tsx    (CREATE)
    ├── TrialCountdownModal.test.tsx (CREATE)
    ├── AhaMomentPrompt.test.tsx (CREATE)
    └── WinbackModal.test.tsx (CREATE)

package.json                (MODIFY: version 1.9.14 → 1.9.15)
```

---

## Critical Deadline

**Deftersaklama trial bitiş: 24 Temmuz 2026 Cuma 12:43 UTC.**
Katman 1 modal onun trial son 3 gün'ünde tetiklenir (yani 21 Temmuz'dan itibaren). Bu implementation en geç **22 Temmuz Çarşamba akşamına kadar deploy edilmeli** ki 24 Temmuz Cuma'ya kadar modal görme fırsatı doğsun. Katman 3 winback modal ise trial expired sonrası tetiklenir — 24 Temmuz sonrası da faydalı.

---

### Task 1: Backend Altyapı (settings + preload + main + types)

**Files:**

- Modify: `main/settings.js` (add 3 new state groups + helpers)
- Modify: `main/preload.js:111-112` civarı (add 6 new IPC methods)
- Modify: `main/main.js:1427-1435` civarı (add 6 new ipcMain.handle)
- Modify: `src/types/electron.d.ts` (add types + IElectronAPI methods)

**Interfaces:**

- Consumes: None (baseline task)
- Produces:
    - `settings.upgradeModal.lastShownAt: string | null` (ISO timestamp)
    - `settings.winback.shownAt: string | null`
    - `settings.onboarding.ahaPromptShownAt: string | null`
    - Main-side helpers: `markUpgradeModalShown()`, `getUpgradeModalState()`, `markWinbackShown()`, `getWinbackState()`, `markAhaPromptShown()`, `resetUpgradeCTAState()`
    - IPC handlers: `'get-upgrade-cta-state'` returns `{ upgradeModal: {...}, winback: {...}, onboarding: {...} }`, `'mark-upgrade-modal-shown'`, `'mark-winback-shown'`, `'mark-aha-prompt-shown'`, `'reset-upgrade-cta-state'` (for dev/testing)
    - Renderer types: `UpgradeCTAState` interface

- [ ] **Step 1: settings.js — defaultSettings.upgradeModal + winback grupları ekle**

Aç `main/settings.js`. Line 40-45 civarı `onboarding: {...}` block'unun altına ekle:

```js
    // Upgrade CTA state (v1.9.15+) — trial → paid conversion boost modal'ları
    // için gösterim işaretleri. Her modal bir kez tetiklendiğinde işaretlenir,
    // gereksiz tekrar gösterimi engeller.
    upgradeModal: {
        lastShownAt: null, // Katman 1: 24h cooldown için
    },
    winback: {
        shownAt: null, // Katman 3: bir kez göster
    },
```

Ayrıca `onboarding` block içine yeni field ekle:

```js
    onboarding: {
        seenWelcomeAt: null,
        firstClientAddedAt: null,
        firstDiscoveryAt: null,
        completedAt: null,
        ahaPromptShownAt: null, // Katman 2: aha moment bir kez göster
    },
```

- [ ] **Step 2: settings.js — readSettings merge pattern'ine ekle**

Line 82-85 civarındaki `onboarding: {...}` merge'ün altına iki yeni merge ekle:

```js
            onboarding: {
                ...defaultSettings.onboarding,
                ...(parsed.onboarding || {}),
            },
            upgradeModal: {
                ...defaultSettings.upgradeModal,
                ...(parsed.upgradeModal || {}),
            },
            winback: {
                ...defaultSettings.winback,
                ...(parsed.winback || {}),
            },
```

- [ ] **Step 3: settings.js — updateSettings merge pattern'ine ekle**

Line 123-126 civarındaki `onboarding: {...}` merge'ün altına ekle:

```js
        onboarding: {
            ...current.onboarding,
            ...(patch.onboarding || {}),
        },
        upgradeModal: {
            ...current.upgradeModal,
            ...(patch.upgradeModal || {}),
        },
        winback: {
            ...current.winback,
            ...(patch.winback || {}),
        },
```

- [ ] **Step 4: settings.js — helper fonksiyonları ekle**

`markOnboardingStep` fonksiyonunun (line 139 civarı) altına ekle:

```js
/**
 * Katman 1 modal gösterildiğinde işaretle. 24h cooldown için timestamp tutar.
 */
const markUpgradeModalShown = () => {
    return updateSettings({ upgradeModal: { lastShownAt: new Date().toISOString() } });
};

/**
 * Katman 3 winback modal gösterildiğinde işaretle. Bir kez gösterilir.
 */
const markWinbackShown = () => {
    return updateSettings({ winback: { shownAt: new Date().toISOString() } });
};

/**
 * Katman 2 aha moment prompt gösterildiğinde işaretle. Bir kez gösterilir.
 */
const markAhaPromptShown = () => {
    return updateSettings({ onboarding: { ahaPromptShownAt: new Date().toISOString() } });
};

/**
 * Upgrade CTA state — tüm 3 katman için tek okuma noktası.
 */
const getUpgradeCTAState = () => {
    const settings = readSettings();
    return {
        upgradeModal: settings.upgradeModal,
        winback: settings.winback,
        onboarding: settings.onboarding,
    };
};

/**
 * Dev/test amaçlı — tüm upgrade CTA state'i sıfırla.
 */
const resetUpgradeCTAState = () => {
    return updateSettings({
        upgradeModal: { lastShownAt: null },
        winback: { shownAt: null },
        onboarding: { ahaPromptShownAt: null },
    });
};
```

- [ ] **Step 5: settings.js — module.exports'a ekle**

Line 274-275 civarındaki `module.exports` object'ine ekle:

```js
module.exports = {
    // ... existing exports
    markOnboardingStep,
    getOnboardingState,
    markUpgradeModalShown,
    markWinbackShown,
    markAhaPromptShown,
    getUpgradeCTAState,
    resetUpgradeCTAState,
};
```

- [ ] **Step 6: preload.js — 4 yeni IPC method expose et**

Aç `main/preload.js`. Line 111-112 civarı (`getOnboardingState`, `markOnboardingStep`) altına ekle:

```js
    getUpgradeCTAState: () => ipcRenderer.invoke('get-upgrade-cta-state'),
    markUpgradeModalShown: () => ipcRenderer.invoke('mark-upgrade-modal-shown'),
    markWinbackShown: () => ipcRenderer.invoke('mark-winback-shown'),
    markAhaPromptShown: () => ipcRenderer.invoke('mark-aha-prompt-shown'),
```

- [ ] **Step 7: main.js — 4 yeni ipcMain.handle ekle**

Aç `main/main.js`. Line 1427-1435 civarındaki `'get-onboarding-state'` ve `'mark-onboarding-step'` handler'larının altına ekle:

```js
ipcMain.handle('get-upgrade-cta-state', () => {
    return settings.getUpgradeCTAState();
});

ipcMain.handle('mark-upgrade-modal-shown', () => {
    settings.markUpgradeModalShown();
    return { success: true };
});

ipcMain.handle('mark-winback-shown', () => {
    settings.markWinbackShown();
    return { success: true };
});

ipcMain.handle('mark-aha-prompt-shown', () => {
    settings.markAhaPromptShown();
    return { success: true };
});
```

- [ ] **Step 8: electron.d.ts — type tanımları ekle**

Aç `src/types/electron.d.ts`. `OnboardingState` interface'inin (line 43) yakınına ekle:

```ts
export interface OnboardingState {
    seenWelcomeAt: string | null;
    firstClientAddedAt: string | null;
    firstDiscoveryAt: string | null;
    completedAt: string | null;
    ahaPromptShownAt: string | null; // v1.9.15+
}

export interface UpgradeModalState {
    lastShownAt: string | null;
}

export interface WinbackState {
    shownAt: string | null;
}

export interface UpgradeCTAState {
    upgradeModal: UpgradeModalState;
    winback: WinbackState;
    onboarding: OnboardingState;
}
```

Aynı dosyada `IElectronAPI` interface'i içine (line 283-284 civarı) ekle:

```ts
getOnboardingState: () => Promise<OnboardingState>;
markOnboardingStep: (
    stepName: 'seenWelcome' | 'firstClientAdded' | 'firstDiscovery' | 'completed' | 'reset'
) => Promise<{ success: boolean }>;
getUpgradeCTAState: () => Promise<UpgradeCTAState>;
markUpgradeModalShown: () => Promise<{ success: boolean }>;
markWinbackShown: () => Promise<{ success: boolean }>;
markAhaPromptShown: () => Promise<{ success: boolean }>;
```

- [ ] **Step 9: Type-check + commit**

Run: `npm run type-check`
Expected: 0 errors.

```bash
git add main/settings.js main/preload.js main/main.js src/types/electron.d.ts
git commit -m "feat(upgrade-cta): backend altyapı — settings + IPC handlers"
```

---

### Task 2: useUpgradeCTA Custom Hook + Test

**Files:**

- Create: `src/components/upgrade/useUpgradeCTA.ts`
- Create: `src/test/useUpgradeCTA.test.tsx`

**Interfaces:**

- Consumes: Task 1'in ürettiği IPC methods (`getUpgradeCTAState`, `markUpgradeModalShown`, `markWinbackShown`, `markAhaPromptShown`) ve types (`UpgradeCTAState`)
- Produces:
    - Hook return: `{ state: UpgradeCTAState, isLoading: boolean, markUpgradeModalShown: () => Promise<void>, markWinbackShown: () => Promise<void>, markAhaPromptShown: () => Promise<void> }`
    - State fetch on mount, optimistic update on mark

- [ ] **Step 1: Test dosyası yaz — mount + markUpgradeModalShown senaryosu**

Create `src/test/useUpgradeCTA.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Test'i çalıştır, fail görmesi beklenir**

Run: `npm test -- src/test/useUpgradeCTA.test.tsx`
Expected: FAIL — "Cannot find module '../components/upgrade/useUpgradeCTA'"

- [ ] **Step 3: useUpgradeCTA hook'unu yaz**

Create `src/components/upgrade/useUpgradeCTA.ts`:

```ts
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
```

- [ ] **Step 4: setupTests mock'lara yeni method'ları ekle**

Aç `src/test/setup.ts` (mevcut). `window.electronAPI` mock'una yeni method'ları ekle:

```ts
    getUpgradeCTAState: vi.fn(),
    markUpgradeModalShown: vi.fn(),
    markWinbackShown: vi.fn(),
    markAhaPromptShown: vi.fn(),
```

- [ ] **Step 5: Test'i çalıştır, pass beklenir**

Run: `npm test -- src/test/useUpgradeCTA.test.tsx`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add src/components/upgrade/useUpgradeCTA.ts src/test/useUpgradeCTA.test.tsx src/test/setup.ts
git commit -m "feat(upgrade-cta): useUpgradeCTA custom hook + testler"
```

---

### Task 3: Katman 1 — TrialCountdownModal + Test + Integration

**Files:**

- Create: `src/components/upgrade/TrialCountdownModal.tsx`
- Create: `src/test/TrialCountdownModal.test.tsx`
- Modify: `src/App.tsx` (render modal conditional)

**Interfaces:**

- Consumes:
    - `useUpgradeCTA()` from Task 2
    - `window.electronAPI.getSubscriptionStatus()` (mevcut) — returns `{ isTrial, trialEndsAt, ... }`
- Produces:
    - Component: `<TrialCountdownModal />` no props — kendi useUpgradeCTA + getSubscriptionStatus çağırır
    - Trigger: `subscription.isTrial === true && (trialEndsAt - now) < 3 gün && (lastShownAt === null || lastShownAt < now - 24h)`
    - Dismiss: `markUpgradeModalShown()` + `setState(hidden=true)` (session-local — sonraki app açılışında logic tekrar kontrol eder)

- [ ] **Step 1: Test dosyası yaz — trigger + render + CTA senaryoları**

Create `src/test/TrialCountdownModal.test.tsx`:

```tsx
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

    it('24h+ önce gösterilmiş → modal tekrar görünür', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: twoDaysAgo },
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
```

- [ ] **Step 2: Test'i çalıştır — FAIL beklenir**

Run: `npm test -- src/test/TrialCountdownModal.test.tsx`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: TrialCountdownModal component yaz**

Create `src/components/upgrade/TrialCountdownModal.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription } from '../../types';

/**
 * Katman 1 — Trial Son 3 Gün Countdown Modal (v1.9.15+).
 *
 * Trial kullanıcısına son 3 günde app açılışında bir kez / 24h cooldown ile
 * gösterilir. Amaç: gerçek kayıp bilinci (indirim değil) ile aboneliğe
 * geçişi tetiklemek.
 *
 * Trigger:
 *   - subscription.isTrial = true
 *   - trialEndsAt - now < 3 gün
 *   - upgradeModal.lastShownAt null VEYA > 24h önce
 */
const TrialCountdownModal: React.FC = () => {
    const { state, isLoading, markUpgradeModalShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const sub = await window.electronAPI.getSubscriptionStatus();
                if (mounted) setSubscription(sub);
            } catch {
                /* silent — modal simply won't show */
            } finally {
                if (mounted) setSubLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    if (isLoading || subLoading || dismissed) return null;
    if (!subscription?.isTrial || !subscription.isActive || !subscription.trialEndsAt) return null;

    const trialEnd = new Date(subscription.trialEndsAt).getTime();
    const now = Date.now();
    const msLeft = trialEnd - now;
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

    if (daysLeft > 3 || daysLeft < 0) return null;

    const lastShown = state.upgradeModal.lastShownAt
        ? new Date(state.upgradeModal.lastShownAt).getTime()
        : 0;
    const hoursSinceLastShow = (now - lastShown) / (60 * 60 * 1000);
    if (lastShown && hoursSinceLastShow < 24) return null;

    const handleDismiss = async () => {
        setDismissed(true);
        await markUpgradeModalShown();
    };

    const handleGoToBilling = async () => {
        setDismissed(true);
        await markUpgradeModalShown();
        // Landing app'e yönlendir. Source tracking için query param.
        window.electronAPI.openExternal?.(
            'https://muhasebeasistani.com/billing?source=trial_last_days_modal'
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[560px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700">
                    <div className="text-amber-400 text-sm font-semibold">
                        ⏳ Deneme süresi bitiyor
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1"
                        aria-label="Kapat"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-8 py-8">
                    <h2 className="text-2xl font-bold text-white mb-3">
                        Deneme sürenizin bitmesine{' '}
                        <span className="text-amber-400">{daysLeft} gün</span>.
                    </h2>
                    <p className="text-slate-400 mb-5">Trial bittikten sonra:</p>
                    <ul className="space-y-2 text-slate-300 mb-6">
                        <li>• Mükellef listenize erişim durur</li>
                        <li>• Arka plan e-tebligat takibi kesilir</li>
                        <li>• Excel Asistanı ve E-Tebligat Kontrol devre dışı kalır</li>
                    </ul>
                    <p className="text-slate-400 leading-relaxed">
                        Kesintisiz devam için Tam Paket abonelik:{' '}
                        <span className="text-white font-semibold">6.000₺/yıl</span>
                        <br />
                        <span className="text-sm text-slate-500">
                            (Excel Asistanı + E-Tebligat Kontrol · 200 mükellef · 5.000 kredi/ay)
                        </span>
                    </p>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleDismiss}
                        className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        Daha Sonra
                    </button>
                    <button
                        onClick={handleGoToBilling}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:shadow-[0_4px_20px_rgba(56,189,248,0.4)] text-white rounded-lg font-semibold transition-all"
                    >
                        Aboneliğe Geç →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrialCountdownModal;
```

- [ ] **Step 4: setupTests mock'a openExternal ekle**

Aç `src/test/setup.ts`. `window.electronAPI` mock'una ekle:

```ts
    openExternal: vi.fn(),
    getSubscriptionStatus: vi.fn(),
```

(Zaten varsa atla)

- [ ] **Step 5: Test'i çalıştır — PASS beklenir**

Run: `npm test -- src/test/TrialCountdownModal.test.tsx`
Expected: PASS — 7 tests

- [ ] **Step 6: App.tsx içinde render et**

Aç `src/App.tsx`. `<UpdateBanner />` render'ının yakınına ekle:

```tsx
import UpdateBanner from './components/UpdateBanner';
import TrialCountdownModal from './components/upgrade/TrialCountdownModal';
```

Render kısmı (`{!isDaemonPopup && <UpdateBanner />}` yakını):

```tsx
{
    !isDaemonPopup && (
        <>
            <UpdateBanner />
            <TrialCountdownModal />
        </>
    );
}
```

- [ ] **Step 7: Type-check + tüm testleri çalıştır**

Run: `npm run type-check && npm test`
Expected: 0 errors + all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/components/upgrade/TrialCountdownModal.tsx src/test/TrialCountdownModal.test.tsx src/test/setup.ts src/App.tsx
git commit -m "feat(upgrade-cta): Katman 1 — Trial Son 3 Gün Countdown Modal"
```

---

### Task 4: Katman 2 — AhaMomentPrompt + Test + Integration

**Files:**

- Create: `src/components/upgrade/AhaMomentPrompt.tsx`
- Create: `src/test/AhaMomentPrompt.test.tsx`
- Modify: `src/pages/tools/ETebligat.tsx` (render prompt after firstDiscoveryAt)

**Interfaces:**

- Consumes:
    - `useUpgradeCTA()` from Task 2
    - `useOnboarding()` (mevcut) — `firstDiscoveryAt` field
    - `window.electronAPI.getSubscriptionStatus()` — sadece trial'da göster
- Produces:
    - Component: `<AhaMomentPrompt firstDiscoveryDurationMs={number} />` prop alır (opsiyonel, gösterim için)
    - Trigger: `firstDiscoveryAt SET olduktan 5 sn sonra + ahaPromptShownAt null + isTrial`
    - Sadece bir kez göster

- [ ] **Step 1: Test dosyası yaz**

Create `src/test/AhaMomentPrompt.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AhaMomentPrompt from '../components/upgrade/AhaMomentPrompt';

describe('AhaMomentPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
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
```

- [ ] **Step 2: Test çalıştır — FAIL beklenir**

Run: `npm test -- src/test/AhaMomentPrompt.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: AhaMomentPrompt component yaz**

Create `src/components/upgrade/AhaMomentPrompt.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription } from '../../types';

interface Props {
    /** İlk keşif taramasının süresi (ms) — metinde gösterim için (opsiyonel) */
    firstDiscoveryDurationMs?: number;
}

/**
 * Katman 2 — Aha Moment Prompt (v1.9.15+).
 *
 * İlk başarılı keşif taramasından 5 saniye sonra (kullanıcı sonucu izlerken)
 * bir kez gösterilir. Trial → Paid differential (10x mükellef, 10x kredi)
 * vurgusu ile heyecan anında planları görmeye davet eder.
 *
 * Trigger:
 *   - subscription.isTrial = true
 *   - onboarding.firstDiscoveryAt SET
 *   - onboarding.ahaPromptShownAt NULL (bir kez göster)
 *   - Component mount'undan 5sn sonra render
 */
const AhaMomentPrompt: React.FC<Props> = ({ firstDiscoveryDurationMs }) => {
    const { state, isLoading, markAhaPromptShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [showAfterDelay, setShowAfterDelay] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const sub = await window.electronAPI.getSubscriptionStatus();
                if (mounted) setSubscription(sub);
            } catch {
                /* silent */
            } finally {
                if (mounted) setSubLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setShowAfterDelay(true), 5000);
        return () => clearTimeout(t);
    }, []);

    if (isLoading || subLoading || dismissed || !showAfterDelay) return null;
    if (!subscription?.isTrial) return null;
    if (!state.onboarding.firstDiscoveryAt) return null;
    if (state.onboarding.ahaPromptShownAt) return null;

    const scanSeconds = firstDiscoveryDurationMs
        ? Math.max(1, Math.round(firstDiscoveryDurationMs / 1000))
        : null;

    const handleClose = async () => {
        setDismissed(true);
        await markAhaPromptShown();
    };

    const handleGoToPlans = async () => {
        setDismissed(true);
        await markAhaPromptShown();
        window.electronAPI.openExternal?.(
            'https://muhasebeasistani.com/billing?source=aha_moment_prompt'
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[480px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="px-6 py-6">
                    <h3 className="text-xl font-bold text-white mb-3">
                        🎉 İlk taraman{' '}
                        {scanSeconds !== null && (
                            <span className="text-emerald-400">{scanSeconds} saniyede</span>
                        )}{' '}
                        bitti!
                    </h3>
                    <div className="grid grid-cols-2 gap-4 my-5">
                        <div className="bg-slate-700/40 rounded-lg p-3">
                            <div className="text-xs text-slate-400 uppercase mb-2">Trial'da</div>
                            <ul className="text-sm text-slate-200 space-y-1">
                                <li>• 20 mükellef</li>
                                <li>• 500 kredi/ay</li>
                                <li>• Tüm modüller</li>
                            </ul>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                            <div className="text-xs text-emerald-400 uppercase mb-2">
                                Aboneliğe geçince
                            </div>
                            <ul className="text-sm text-slate-200 space-y-1">
                                <li>• 200 mükellef (10 kat)</li>
                                <li>• 5.000 kredi/ay (10 kat)</li>
                                <li>• Aynı modüller</li>
                            </ul>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm">
                        Tam Paket: <span className="text-white font-semibold">6.000₺/yıl</span>
                    </p>
                </div>
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-white text-sm px-3 py-1.5"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleGoToPlans}
                        className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                        Planları İncele →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AhaMomentPrompt;
```

- [ ] **Step 4: Test çalıştır — PASS beklenir**

Run: `npm test -- src/test/AhaMomentPrompt.test.tsx`
Expected: PASS — 6 tests

- [ ] **Step 5: ETebligat.tsx içinde render et**

Aç `src/pages/tools/ETebligat.tsx`. Import ekle:

```tsx
import AhaMomentPrompt from '../../components/upgrade/AhaMomentPrompt';
```

DiscoveryPrompt render'ının yakınına (`{showDiscoveryPrompt && (...)}` civarı) ekle:

```tsx
{
    onboardingState.firstDiscoveryAt && (
        <AhaMomentPrompt firstDiscoveryDurationMs={lastDiscoveryDurationMs} />
    );
}
```

Not: `lastDiscoveryDurationMs` mevcut değilse (ilk implementasyon) prop atlanabilir:

```tsx
{
    onboardingState.firstDiscoveryAt && <AhaMomentPrompt />;
}
```

- [ ] **Step 6: Type-check + tüm testleri çalıştır**

Run: `npm run type-check && npm test`
Expected: 0 errors + all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/upgrade/AhaMomentPrompt.tsx src/test/AhaMomentPrompt.test.tsx src/pages/tools/ETebligat.tsx
git commit -m "feat(upgrade-cta): Katman 2 — Aha Moment Prompt"
```

---

### Task 5: Katman 3 — WinbackModal + Test + Integration

**Files:**

- Create: `src/components/upgrade/WinbackModal.tsx`
- Create: `src/test/WinbackModal.test.tsx`
- Modify: `src/App.tsx` (render conditional)

**Interfaces:**

- Consumes:
    - `useUpgradeCTA()` from Task 2
    - `window.electronAPI.getSubscriptionStatus()` — trial_end_reason kontrolü
    - `window.electronAPI.getScanHistory(limit?)` — mevcut IPC — trial period içi scan sayısı için
    - `window.electronAPI.getClients()` — mevcut IPC — mükellef sayısı için
- Produces:
    - Component: `<WinbackModal />` no props
    - Trigger: `subscription.isTrial = true AND status = 'expired' AND winback.shownAt = null`
    - Dinamik istatistik: X tarama, Y saat (X\*3 dk), Z mükellef

- [ ] **Step 1: Test dosyası yaz**

Create `src/test/WinbackModal.test.tsx`:

```tsx
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
            trialEndReason: 'expired',
        });
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: null },
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

    it('winback.shownAt SET → modal görünmez (bir kez göster)', async () => {
        // @ts-expect-error mock
        window.electronAPI.getUpgradeCTAState.mockResolvedValue({
            upgradeModal: { lastShownAt: null },
            winback: { shownAt: '2026-07-15T10:00:00Z' },
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
```

- [ ] **Step 2: Test çalıştır — FAIL beklenir**

Run: `npm test -- src/test/WinbackModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: WinbackModal component yaz**

Create `src/components/upgrade/WinbackModal.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useUpgradeCTA } from './useUpgradeCTA';
import type { Subscription, Client } from '../../types';

/**
 * Katman 3 — Trial Expired Winback Modal (v1.9.15+).
 *
 * Trial süresi dolan kullanıcıya app açılışında bir kez gösterilir.
 * Kişisel istatistik özeti (X tarama, Y saat, Z mükellef) ile trial'da
 * yaşadığı değeri hatırlatır. İndirim / kupon YOK — gerçek kayıp bilinci.
 *
 * Trigger:
 *   - subscription.isTrial = true (trial'dan expired'a geçmiş)
 *   - subscription.status = 'expired' (cron çalışmış)
 *   - winback.shownAt = null
 */
const WinbackModal: React.FC = () => {
    const { state, isLoading, markWinbackShown } = useUpgradeCTA();
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [scanCount, setScanCount] = useState(0);
    const [clientCount, setClientCount] = useState(0);
    const [subLoading, setSubLoading] = useState(true);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const [sub, history, clients] = await Promise.all([
                    window.electronAPI.getSubscriptionStatus(),
                    window.electronAPI.getScanHistory(500),
                    window.electronAPI.getClients(),
                ]);
                if (!mounted) return;
                setSubscription(sub);
                setScanCount(Array.isArray(history) ? history.length : 0);
                setClientCount(Array.isArray(clients) ? clients.length : 0);
            } catch {
                /* silent */
            } finally {
                if (mounted) setSubLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    if (isLoading || subLoading || dismissed) return null;
    if (!subscription?.isTrial) return null;
    if (subscription.status !== 'expired') return null;
    if (state.winback.shownAt) return null;

    const hoursSaved = Math.max(1, Math.round((scanCount * 3) / 60));

    const handleDismiss = async () => {
        setDismissed(true);
        await markWinbackShown();
    };

    const handleGoToBilling = async () => {
        setDismissed(true);
        await markWinbackShown();
        window.electronAPI.openExternal?.(
            'https://muhasebeasistani.com/billing?source=winback_modal'
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-[560px] max-w-[92vw] shadow-2xl overflow-hidden">
                <div className="px-8 py-8">
                    <h2 className="text-2xl font-bold text-white mb-4">Deneme süreniz doldu.</h2>
                    <p className="text-slate-400 mb-3">Trial sırasında:</p>
                    <ul className="space-y-2 text-slate-200 mb-6">
                        <li>
                            • <span className="text-emerald-400 font-semibold">{scanCount}</span>{' '}
                            tarama yaptınız
                        </li>
                        <li>
                            • Tahmini{' '}
                            <span className="text-emerald-400 font-semibold">{hoursSaved}</span>{' '}
                            saat tasarruf ettiniz
                        </li>
                        <li>
                            • <span className="text-emerald-400 font-semibold">{clientCount}</span>{' '}
                            mükellef eklediniz
                        </li>
                    </ul>
                    <div className="bg-slate-700/40 rounded-lg p-4 mb-4">
                        <p className="text-white font-semibold mb-2">
                            Tam Paket ile devam edin: 6.000₺/yıl
                        </p>
                        <ul className="text-sm text-slate-300 space-y-1">
                            <li>• 200 mükellef limiti</li>
                            <li>• 5.000 kredi/ay</li>
                            <li>• Excel Asistanı + E-Tebligat Kontrol</li>
                        </ul>
                    </div>
                    <p className="text-sm text-slate-500">
                        Mükellef listeniz ve ayarlarınız korunur.
                    </p>
                </div>
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={handleDismiss}
                        className="text-slate-400 hover:text-white text-sm px-3 py-1.5 transition-colors"
                    >
                        Şimdi Değil
                    </button>
                    <button
                        onClick={handleGoToBilling}
                        className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-sky-600 hover:shadow-[0_4px_20px_rgba(56,189,248,0.4)] text-white rounded-lg font-semibold transition-all"
                    >
                        Aboneliğe Geç →
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WinbackModal;
```

- [ ] **Step 4: setupTests mock'a getClients ekle**

Aç `src/test/setup.ts`. Ekle:

```ts
    getClients: vi.fn(),
    getScanHistory: vi.fn(),
```

- [ ] **Step 5: Test çalıştır — PASS beklenir**

Run: `npm test -- src/test/WinbackModal.test.tsx`
Expected: PASS — 8 tests

- [ ] **Step 6: App.tsx içinde render et**

Aç `src/App.tsx`. TrialCountdownModal ile birlikte:

```tsx
import TrialCountdownModal from './components/upgrade/TrialCountdownModal';
import WinbackModal from './components/upgrade/WinbackModal';
```

Render:

```tsx
{
    !isDaemonPopup && (
        <>
            <UpdateBanner />
            <TrialCountdownModal />
            <WinbackModal />
        </>
    );
}
```

- [ ] **Step 7: Type-check + tüm testleri çalıştır**

Run: `npm run type-check && npm test`
Expected: 0 errors + all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/components/upgrade/WinbackModal.tsx src/test/WinbackModal.test.tsx src/test/setup.ts src/App.tsx
git commit -m "feat(upgrade-cta): Katman 3 — Trial Expired Winback Modal"
```

---

### Task 6: Release Prep — Version Bump + Tag + Build

**Files:**

- Modify: `package.json` (version 1.9.14 → 1.9.15)

**Interfaces:**

- Consumes: Task 1-5 tüm katmanlar tamamlanmış olmalı
- Produces: v1.9.15 canlı GitHub Release

- [ ] **Step 1: package.json version bump**

Aç `package.json`. `"version": "1.9.14"` satırını `"version": "1.9.15"` yap.

- [ ] **Step 2: Final validation — type-check + lint + test**

Run:

```bash
npm run type-check
npm run lint
npm test
```

Expected: 0 errors, 0 lint errors (pre-existing warnings kabul), tüm testler pass.

- [ ] **Step 3: Manuel dev test — smoke test**

Run: `npm start`

Manuel kontrol:

- Login sayfası hâlâ çalışıyor
- MainLayout render ediliyor
- Test kullanıcı ekle → E-Tebligat açık iken preview scan yap → 5sn sonra AhaMomentPrompt görünmeli
- Kapatıp aç, tekrar görünmemeli (ahaPromptShownAt işaretlendi)
- Dev mode'da TrialCountdownModal görünmez (kullanıcı Trial değil, kendi hesap muhtemelen paid)
- WinbackModal görünmez (trial expired olmadıkça)

- [ ] **Step 4: Commit version bump + release tag**

```bash
git add package.json
git commit -m "release: v1.9.15 — trial conversion boost (Katman 1-2-3)"
git tag -a v1.9.15 -m "v1.9.15 — Trial → Paid Conversion Boost

Yeni:
- Katman 1: Trial Son 3 Gün Countdown Modal (24h cooldown)
- Katman 2: Aha Moment Prompt (ilk keşif sonrası 5sn gecikmeli, bir kez)
- Katman 3: Trial Expired Winback Modal (bir kez, kişisel istatistik özeti)

Prensipler:
- İndirim/kupon YOK — 6.000₺/yıl sabit fiyat
- Ürün özellikleri kaynak-doğrulanmış (trial 20mük/500kredi, paid 200mük/5.000kredi)
- Aciliyet için sadece gerçek kayıp bilinci"
```

- [ ] **Step 5: Push tag + main → build tetiklenir**

```bash
env -u GITHUB_TOKEN git push origin main --follow-tags
```

Expected: `[new tag] v1.9.15 -> v1.9.15` + main branch push.

- [ ] **Step 6: Build takip**

Run:

```bash
gh run list --limit 1
```

Expected: `in_progress` — Build and Release workflow başlatılmış olmalı.

Yaklaşık 25 dk build sürer. Bitince:

```bash
env -u GITHUB_TOKEN gh release view v1.9.15 --json assets --jq '.assets[] | select(.name | test("Setup.exe$|dmg$|AppImage$|.yml$")) | .name'
```

Expected: Setup.exe, arm64.dmg, x64.dmg, AppImage, latest.yml, latest-mac.yml, latest-linux.yml görülmeli.

- [ ] **Step 7: Release notes GitHub'a ekle**

`docs/specs/2026-07-17-trial-conversion-boost.md` içeriğinin özetini `env -u GITHUB_TOKEN gh release edit v1.9.15 --notes-file <path>` ile publish et. Ya da manuel notes yaz:

```markdown
## v1.9.15 — Trial → Paid Conversion Boost

Trial kullanıcılarını 3 kritik anda aboneliğe yönlendiren modal sistemi:

- **Trial Son 3 Gün Countdown** — Deneme süresi bitmeden hatırlatıcı (24h cooldown)
- **Aha Moment Prompt** — İlk başarılı keşif taramasından 5 saniye sonra Trial vs Paid karşılaştırması
- **Trial Expired Winback** — Kişisel istatistik özeti ile geri kazanma

Ürün özellikleri:

- Trial: 20 mükellef · 500 kredi/ay · tüm modüller
- Pro Paid: 200 mükellef · 5.000 kredi/ay · tüm modüller · **6.000₺/yıl**
```

- [ ] **Step 8: Metric baseline kaydı**

Release yapıldığı anda Supabase'te durum snapshot al (yeni upgrade'lerin sonucunu karşılaştırmak için):

```sql
SELECT
  COUNT(*) FILTER (WHERE is_trial=true AND status='active') as active_trials,
  COUNT(*) FILTER (WHERE is_trial=false AND is_complimentary=false) as paid_users,
  COUNT(*) FILTER (WHERE app_version = '1.9.15') as v1915_adoption
FROM subscriptions;
```

Bu snapshot'ı memory'ye kaydet — 1 hafta sonraki karşılaştırma için başlangıç noktası.

---

## Self-Review Notları

- Spec coverage: Katman 1 (Task 3), Katman 2 (Task 4), Katman 3 (Task 5), backend infra (Task 1), hook (Task 2), release (Task 6). ✅
- Katman 4-5 (ROI widget + sosyal kanıt) v1.10.0'a ertelendi — bu plan sadece v1.9.15 kapsamında.
- Placeholder yok, her step'te tam kod var.
- Type consistency: `UpgradeCTAState`, `UpgradeModalState`, `WinbackState`, `OnboardingState` — hepsi Task 1'de tanımlı, Task 2-5 aynı isimle kullanır.
- Backend `signup_source` migration Task 1'de yok — sadece query param olarak kullanılıyor (`?source=X`), landing app tarafında (`payment_sessions.signup_source` opsiyonel). DB migration bu plan scope'unda değil, opsiyonel v1.10.0'a.
- TrialCountdownModal 24h cooldown testleri ve İndirim dili yasağı testleri her component'te var.
- Kritik deadline (24 Temmuz) Task 6'da vurgu ile beliriyor.

---

## İlgili

- Spec: `docs/specs/2026-07-17-trial-conversion-boost.md`
- Memory: [[project-pricing]], [[feedback-no-discount-tactics]], [[feedback-verify-product-specs]]
- v1.9.14 onboarding pattern (Task 2 reference): `src/components/onboarding/useOnboarding.ts`, `src/components/onboarding/WelcomeModal.tsx`
- v1.9.14 auto-updater fix (release pattern reference): commit `916c9fd`
