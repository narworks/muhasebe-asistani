# Conversion Huni Revizyonu (v1.9.16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trial kullanıcılarını uygulama içinden satın-alma akışına sokan 5 sızıntıyı kapat (görünür "Satın Al" butonu, dolmuş-trial kalıcı banner, tekrar-gösterilen Winback modal, güçlü kalıcı CTA, source=desktop).

**Architecture:** Mevcut bileşenlerde yerinde düzenleme; yeni mimari yok. Renderer (React/TS) + main process (plain JS) + tip tanımı. Beş bağımsız görev, her biri kendi test döngüsüyle.

**Tech Stack:** Electron 35, React 18, Vite, TypeScript, Tailwind, Vitest + @testing-library/react.

## Global Constraints

- **Erişim:** Yalnızca v1.9.15+ kullanıcılara ulaşır. v1.9.11 stuck kullanıcılar kapsam dışı.
- **Pazarlama kuralı:** İndirim/kupon/promosyon/yapay kıtlık YOK. "Kayıp bilinci" (süre doldu) serbest.
- **Fiyatlar (değiştirilmez):** Tam Paket 6.000₺ (`plan-bundle-annual`), E-Tebligat Kontrol 5.000₺ (`plan-etebligat-annual`), Excel Asistanı 2.500₺ (`plan-excel-annual`).
- **"1.500₺ tasarruf" / üstü çizili 7.500₺** bundle-vs-tektek karşılaştırması dürüst, dokunulmaz.
- **Prettier:** 4-space indent, single quote, trailing comma (es5), semicolon, 100 char.
- **Commit mesajları** şu satırla biter: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Branch:** `feature/conversion-funnel-v1916` (zaten açık, spec commit'i burada).
- **Test komutu:** `npm test` (vitest run). Tek dosya: `npx vitest run src/test/<file>`.

## File Structure

| Dosya                                     | Sorumluluk                                              | Görev |
| ----------------------------------------- | ------------------------------------------------------- | ----- |
| `main/main.js`                            | `open-checkout` IPC — checkout URL'ine `source=desktop` | T1    |
| `src/types/electron.d.ts`                 | `WinbackState.count` tipi                               | T2    |
| `main/settings.js`                        | `winback.count` default + increment + reset             | T2    |
| `src/components/upgrade/useUpgradeCTA.ts` | `defaultState` + optimistic `count`                     | T2    |
| `src/components/upgrade/WinbackModal.tsx` | gate: client-side expiry + 7g/3x kadans                 | T2    |
| `src/test/WinbackModal.test.tsx`          | kadans/expiry test güncelleme                           | T2    |
| `src/components/TrialBanner.tsx`          | dolmuş-trial kırmızı varyant                            | T3    |
| `src/test/TrialBanner.test.tsx`           | yeni test dosyası                                       | T3    |
| `src/lib/subscriptionUtils.ts`            | `getTrialBadge()` saf yardımcı                          | T4    |
| `src/test/subscriptionUtils.test.ts`      | yeni test dosyası                                       | T4    |
| `src/components/layout/Sidebar.tsx`       | trial rozeti bağlama                                    | T4    |
| `src/components/layout/Navbar.tsx`        | inactive "Abone Ol" çipi belirginleştirme               | T4    |
| `src/pages/dashboard/Subscription.tsx`    | kart içi "Satın Al" butonu + forma scroll               | T5    |
| `src/test/Subscription.test.tsx`          | yeni test dosyası                                       | T5    |

---

## Task 1: P4 — openCheckout source=desktop

**Files:**

- Modify: `main/main.js:1840-1845` (`open-checkout` handler)

**Interfaces:**

- Consumes: yok.
- Produces: yok (checkout URL'i `source=desktop` içerir).

Not: `main/` vitest kapsamında değil (config `include: ['src/**']`) → otomatik test yok, doğrulama grep + manuel. Tek satırlık, düşük riskli.

- [ ] **Step 1: source=desktop paramını ekle**

`main/main.js` içinde `open-checkout` handler'ında (`urlParams` bloğu), `period` set'inden sonra:

```js
const urlParams = new URLSearchParams();
urlParams.set('plan', plan);
urlParams.set('period', period);
urlParams.set('source', 'desktop'); // open-billing-portal ile tutarlı kompakt masaüstü arayüzü
urlParams.set('email', email);
urlParams.set('name', name);
if (phone) urlParams.set('phone', phone);
```

- [ ] **Step 2: Doğrula**

Run: `grep -n "source', 'desktop'" main/main.js`
Expected: `open-checkout` (yeni, ~1842) VE `open-billing-portal` (mevcut, ~1884) satırları — iki eşleşme.

Run: `npm run lint -- main/main.js` (veya `npx eslint main/main.js`)
Expected: hata yok.

- [ ] **Step 3: Commit**

```bash
git add main/main.js
git commit -m "fix(funnel): openCheckout'a source=desktop ekle (P4)

Süresi dolan kullanıcının kullandığı /billing/checkout yolu da kompakt
masaüstü arayüzünü açsın — open-billing-portal ile tutarlı.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: P2 — WinbackModal tekrar-gösterim + client-side expiry

Trial dolan kullanıcıya Winback modal'ı (a) server cron beklemeden trial biter bitmez göster, (b) tek-sefer yerine 7 günde bir en fazla 3 kez göster.

**Files:**

- Modify: `src/types/electron.d.ts:57-59` (`WinbackState`)
- Modify: `main/settings.js:53-55` (default), `:204-206` (markWinbackShown), `:230-236` (reset)
- Modify: `src/components/upgrade/useUpgradeCTA.ts:4-14` (defaultState), `:57-65` (markWinbackShown)
- Modify: `src/components/upgrade/WinbackModal.tsx:49-52` (gate)
- Test: `src/test/WinbackModal.test.tsx`

**Interfaces:**

- Consumes: `useUpgradeCTA()` → `{ state: { winback: { shownAt: string|null; count: number } }, markWinbackShown }`.
- Produces: `WinbackState = { shownAt: string | null; count: number }`.

- [ ] **Step 1: Testleri güncelle (kırmızı)**

`src/test/WinbackModal.test.tsx` — `beforeEach` içindeki `getUpgradeCTAState` mock'una `count: 0` ekle, `getSubscriptionStatus` default'una `trialEndsAt` ekle:

```tsx
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
```

`'winback.shownAt SET → modal görünmez (bir kez göster)'` testini SİL, yerine şu dört testi ekle:

```tsx
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
```

- [ ] **Step 2: Testleri çalıştır (kırmızı doğrula)**

Run: `npx vitest run src/test/WinbackModal.test.tsx`
Expected: yeni 4 testten en az "count>=3" ve "cooldown" FAIL (mevcut gate `shownAt` varsa gizliyor ama count/cooldown mantığı yok).

- [ ] **Step 3: `WinbackState` tipine count ekle**

`src/types/electron.d.ts:57-59`:

```ts
export interface WinbackState {
    shownAt: string | null;
    count: number;
}
```

- [ ] **Step 4: settings.js — default + increment + reset**

`main/settings.js` default `winback` (satır 53-55):

```js
    winback: {
        shownAt: null, // Katman 3: son gösterim zamanı
        count: 0, // Katman 3: toplam gösterim sayısı (max 3)
    },
```

`markWinbackShown` (satır 204-206) — mevcut count'u okuyup +1 yaz:

```js
const markWinbackShown = () => {
    const current = readSettings().winback || {};
    return updateSettings({
        winback: {
            shownAt: new Date().toISOString(),
            count: (current.count || 0) + 1,
        },
    });
};
```

`resetUpgradeCTAState` (satır 230-236) winback satırı:

```js
        winback: { shownAt: null, count: 0 },
```

- [ ] **Step 5: useUpgradeCTA.ts — defaultState + optimistic count**

`src/components/upgrade/useUpgradeCTA.ts` defaultState (satır 4-14) winback:

```ts
    winback: { shownAt: null, count: 0 },
```

`markWinbackShown` (satır 57-65) optimistic update:

```ts
const markWinbackShown = useCallback(async () => {
    const timestamp = new Date().toISOString();
    setState((prev) => ({
        ...prev,
        winback: { shownAt: timestamp, count: (prev.winback.count ?? 0) + 1 },
    }));
    try {
        await window.electronAPI.markWinbackShown();
    } catch (err) {
        console.error('[useUpgradeCTA] Failed to mark winback shown:', err);
    }
}, []);
```

- [ ] **Step 6: WinbackModal gate — client-side expiry + 7g/3x**

`src/components/upgrade/WinbackModal.tsx` — mevcut gate (satır 49-52):

```tsx
if (isLoading || subLoading || dismissed) return null;
if (!subscription?.isTrial) return null;
if (subscription.status !== 'expired') return null;
if (state.winback.shownAt) return null;
```

yerine:

```tsx
if (isLoading || subLoading || dismissed) return null;
if (!subscription?.isTrial) return null;

// Client-side expiry: server cron status='expired' VEYA trialEndsAt geçmişte.
// Cron gecikse bile trial biter bitmez tetiklenir.
const trialExpired =
    subscription.status === 'expired' ||
    (subscription.trialEndsAt != null && new Date(subscription.trialEndsAt).getTime() < Date.now());
if (!trialExpired) return null;

// Kadans: 7 günde bir, en fazla 3 kez.
const WINBACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const winbackCount = state.winback.count ?? 0;
if (winbackCount >= 3) return null;
const lastShownMs = state.winback.shownAt ? new Date(state.winback.shownAt).getTime() : 0;
if (lastShownMs && Date.now() - lastShownMs < WINBACK_COOLDOWN_MS) return null;
```

- [ ] **Step 7: Testleri çalıştır (yeşil)**

Run: `npx vitest run src/test/WinbackModal.test.tsx src/test/useUpgradeCTA.test.tsx`
Expected: hepsi PASS. (useUpgradeCTA testi mock state'i aynen sakladığı için `count` eklenmesinden etkilenmez.)

- [ ] **Step 8: Tip kontrolü + commit**

Run: `npm run type-check`
Expected: hata yok.

```bash
git add src/types/electron.d.ts main/settings.js src/components/upgrade/useUpgradeCTA.ts src/components/upgrade/WinbackModal.tsx src/test/WinbackModal.test.tsx
git commit -m "feat(funnel): Winback modal 7g/3x tekrar-gösterim + client-side expiry (P2)

Trial biter bitmez (cron beklemeden) tetiklenir; tek-sefer yerine 7 günde
bir en fazla 3 kez gösterilir (settings.winback.count).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: P1 — TrialBanner dolmuş-trial kalıcı kırmızı şeridi

Trial dolunca kaybolan banner yerine, `isTrial && !isActive` durumunda kalıcı kırmızı "Deneme süreniz doldu — Abone Ol" şeridi göster.

**Files:**

- Modify: `src/components/TrialBanner.tsx:36-68`
- Test: `src/test/TrialBanner.test.tsx` (yeni)

**Interfaces:**

- Consumes: `window.electronAPI.getSubscriptionStatus()` → `{ isTrial, isActive, trialEndsAt }`.
- Produces: yok.

- [ ] **Step 1: Test dosyasını yaz (kırmızı)**

`src/test/TrialBanner.test.tsx` (yeni):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrialBanner from '../components/TrialBanner';

const renderBanner = () =>
    render(
        <MemoryRouter>
            <TrialBanner />
        </MemoryRouter>
    );

describe('TrialBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('aktif trial → geri sayım şeridi görünür', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: true,
            trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        });
        renderBanner();
        await waitFor(() => expect(screen.getByText(/ücretsiz deneme/)).toBeInTheDocument());
        expect(screen.getByText(/5 gün/)).toBeInTheDocument();
    });

    it('dolmuş trial (isActive false) → kırmızı "Deneme süreniz doldu" + Abone Ol', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: false,
            trialEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
        });
        renderBanner();
        await waitFor(() => expect(screen.getByText(/Deneme süreniz doldu/)).toBeInTheDocument());
        expect(screen.getByRole('link', { name: /Abone Ol/ })).toBeInTheDocument();
    });

    it('ücretli kullanıcı (isTrial false) → hiçbir şey render etmez', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: false,
            isActive: true,
        });
        const { container } = renderBanner();
        await waitFor(() => expect(window.electronAPI.getSubscriptionStatus).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
```

- [ ] **Step 2: Testi çalıştır (kırmızı)**

Run: `npx vitest run src/test/TrialBanner.test.tsx`
Expected: "dolmuş trial" testi FAIL (şu an expired'da `return null`).

- [ ] **Step 3: TrialBanner gate'ini üç duruma böl**

`src/components/TrialBanner.tsx` — satır 36'dan itibaren (return null + mevcut render) şununla değiştir:

```tsx
if (!subscription?.isTrial) return null;

// Trial dolmuş (isActive false) → kalıcı kırmızı "abone ol" şeridi.
// Conversion baskısının en yüksek olduğu an; banner burada kaybolmamalı.
if (!subscription.isActive) {
    return (
        <div className="border-b px-4 py-2 text-sm flex items-center justify-between gap-3 bg-red-600/15 border-red-600/50 text-red-200">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">⏰</span>
                <span className="truncate">
                    <strong>Deneme süreniz doldu</strong> — devam etmek için abone olun
                </span>
            </div>
            <Link
                to="/subscription"
                className="shrink-0 bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-semibold transition-colors"
            >
                Abone Ol
            </Link>
        </div>
    );
}

// Aktif trial → geri sayım şeridi (renk skalası).
const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
const daysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
    : 0;

const urgency =
    daysLeft <= 2
        ? 'bg-red-500/10 border-red-500/30 text-red-300'
        : daysLeft <= 5
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-sky-500/10 border-sky-500/30 text-sky-300';

return (
    <div
        className={`border-b px-4 py-2 text-sm flex items-center justify-between gap-3 ${urgency}`}
    >
        <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">🎁</span>
            <span className="truncate">
                <strong>{daysLeft} gün</strong> ücretsiz deneme süreniz kaldı
            </span>
        </div>
        <Link
            to="/subscription"
            className="shrink-0 bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-xs font-semibold transition-colors"
        >
            Abone Ol
        </Link>
    </div>
);
```

- [ ] **Step 4: Testi çalıştır (yeşil)**

Run: `npx vitest run src/test/TrialBanner.test.tsx`
Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrialBanner.tsx src/test/TrialBanner.test.tsx
git commit -m "feat(funnel): dolmuş-trial kalıcı kırmızı banner (P1)

Trial dolunca kaybolan şerit yerine 'Deneme süreniz doldu — Abone Ol'
kalıcı kırmızı şeridi. MainLayout'ta mount → uygulama geneli.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: P3 — Kalıcı CTA güçlendirme (getTrialBadge + Sidebar + Navbar)

Trial-farkında rozet yardımcısı (saf fonksiyon, test edilebilir) + Sidebar'a bağlama + Navbar "Abone Ol" çipini belirginleştirme.

**Files:**

- Modify: `src/lib/subscriptionUtils.ts` (yeni `getTrialBadge` export)
- Test: `src/test/subscriptionUtils.test.ts` (yeni)
- Modify: `src/components/layout/Sidebar.tsx:325-336` (rozet dalı) + import
- Modify: `src/components/layout/Navbar.tsx:58` (inactive çip stili)

**Interfaces:**

- Produces: `getTrialBadge(subscription: Subscription | null): { label: string; classes: string } | null`.
- Consumes: Sidebar `getTrialBadge`'i kullanır; `getExpiryStatus`/`getSeverityColors`/`getCompactLabel` (mevcut) korunur.

- [ ] **Step 1: getTrialBadge testini yaz (kırmızı)**

`src/test/subscriptionUtils.test.ts` (yeni):

```ts
import { describe, it, expect } from 'vitest';
import { getTrialBadge } from '../lib/subscriptionUtils';
import type { Subscription } from '../types';

const base = (over: Partial<Subscription>): Subscription =>
    ({ isTrial: false, isActive: true, ...over }) as Subscription;

describe('getTrialBadge', () => {
    it('trial değil → null', () => {
        expect(getTrialBadge(base({ isTrial: false }))).toBeNull();
    });

    it('aktif trial 10 gün → "10 gün" (sky)', () => {
        const badge = getTrialBadge(
            base({
                isTrial: true,
                isActive: true,
                trialEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
            })
        );
        expect(badge?.label).toBe('10 gün');
        expect(badge?.classes).toContain('sky');
    });

    it('aktif trial 1 gün → kırmızı sınıf', () => {
        const badge = getTrialBadge(
            base({
                isTrial: true,
                isActive: true,
                trialEndsAt: new Date(Date.now() + 1 * 86_400_000).toISOString(),
            })
        );
        expect(badge?.classes).toContain('red');
    });

    it('dolmuş trial (isActive false) → "Süresi doldu" kırmızı', () => {
        const badge = getTrialBadge(base({ isTrial: true, isActive: false }));
        expect(badge?.label).toBe('Süresi doldu');
        expect(badge?.classes).toContain('red');
    });

    it('null subscription → null', () => {
        expect(getTrialBadge(null)).toBeNull();
    });
});
```

- [ ] **Step 2: Testi çalıştır (kırmızı)**

Run: `npx vitest run src/test/subscriptionUtils.test.ts`
Expected: FAIL — `getTrialBadge` export edilmemiş.

- [ ] **Step 3: getTrialBadge'i ekle**

`src/lib/subscriptionUtils.ts` sonuna:

```ts
/**
 * Trial kullanıcıları için Sidebar rozeti. getExpiryStatus `expiresAt`'e dayalı
 * ve trial'da null döner; bu yardımcı `trialEndsAt`/`isActive`'ten hesaplar.
 * Ücretli/complimentary (isTrial=false) için null → mevcut getExpiryStatus rozeti kullanılır.
 */
export function getTrialBadge(
    subscription: Subscription | null
): { label: string; classes: string } | null {
    if (!subscription?.isTrial) return null;
    if (!subscription.isActive) {
        return { label: 'Süresi doldu', classes: 'bg-red-600/15 text-red-200' };
    }
    if (!subscription.trialEndsAt) return null;
    const daysLeft = Math.max(
        0,
        Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    );
    const classes =
        daysLeft <= 2
            ? 'bg-red-500/10 text-red-300'
            : daysLeft <= 5
              ? 'bg-amber-500/10 text-amber-300'
              : 'bg-sky-500/10 text-sky-300';
    return { label: `${daysLeft} gün`, classes };
}
```

- [ ] **Step 4: Testi çalıştır (yeşil)**

Run: `npx vitest run src/test/subscriptionUtils.test.ts`
Expected: 5 test PASS.

- [ ] **Step 5: Sidebar'a bağla**

`src/components/layout/Sidebar.tsx` — mevcut `getExpiryStatus` import satırına `getTrialBadge` ekle (aynı `../../lib/subscriptionUtils` importu). Sonra "Abonelik" rozeti bloğunu (satır 325-336 IIFE) şununla değiştir:

```tsx
{
    (() => {
        const trialBadge = getTrialBadge(subscription);
        if (trialBadge) {
            return (
                <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${trialBadge.classes} font-medium`}
                >
                    {trialBadge.label}
                </span>
            );
        }
        const status = getExpiryStatus(subscription);
        if (!status.shouldShowBanner) return null;
        const colors = getSeverityColors(status.severity);
        return (
            <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} font-medium`}
            >
                {getCompactLabel(status)}
            </span>
        );
    })();
}
```

- [ ] **Step 6: Navbar inactive çipini belirginleştir**

`src/components/layout/Navbar.tsx` — inactive dalı (satır 58), soluk `bg-sky-500/10 text-sky-400` yerine dolu buton:

```tsx
                            : 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm'
```

(Sadece bu string değişir; aktif/PRO ve isLowCredits dalları aynı kalır.)

- [ ] **Step 7: Tip kontrolü + lint**

Run: `npm run type-check && npx vitest run src/test/subscriptionUtils.test.ts`
Expected: hata yok, testler PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/subscriptionUtils.ts src/test/subscriptionUtils.test.ts src/components/layout/Sidebar.tsx src/components/layout/Navbar.tsx
git commit -m "feat(funnel): trial-farkında Sidebar rozeti + belirgin Navbar Abone Ol çipi (P3)

getTrialBadge saf yardımcısı (trialEndsAt/isActive) → Sidebar 'Abonelik'
rozeti trial'da da dolu; Navbar inactive çipi dolu sky buton.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: P0 — /subscription görünür "Satın Al" butonları + forma scroll

Plan kartlarını `<div>`'e çevir, her birine açık "Satın Al →" butonu koy; tıklayınca planı seç + ödeme formuna yumuşak kaydır.

**Files:**

- Modify: `src/pages/dashboard/Subscription.tsx` (kartlar 255-354, form 358, yeni `formRef`/`useEffect`/`useRef`)
- Test: `src/test/Subscription.test.tsx` (yeni)

**Interfaces:**

- Consumes: `useAuth()`, `window.electronAPI.getSubscriptionStatus/getCredits/onCreditsUpdated/openCheckout`.
- Produces: yok.

- [ ] **Step 1: Testi yaz (kırmızı)**

`src/test/Subscription.test.tsx` (yeni):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ currentUser: { email: 'test@example.com' } }),
}));

import Subscription from '../pages/dashboard/Subscription';

describe('Subscription — Satın Al akışı', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Element.prototype.scrollIntoView = vi.fn();
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: true,
            isActive: false,
            status: 'expired',
            modules: [],
        });
        // @ts-expect-error mock
        window.electronAPI.getCredits.mockResolvedValue(null);
        // @ts-expect-error mock
        window.electronAPI.onCreditsUpdated.mockReturnValue(() => {});
        // @ts-expect-error mock
        window.electronAPI.openCheckout.mockResolvedValue({ success: true });
    });

    it('trial/expired kullanıcıda "Satın Al" butonları görünür', async () => {
        render(<Subscription />);
        await waitFor(() =>
            expect(
                screen.getAllByRole('button', { name: /Satın Al/ }).length
            ).toBeGreaterThanOrEqual(3)
        );
    });

    it('"Satın Al" tıklaması ödeme formunu açar', async () => {
        render(<Subscription />);
        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: /Satın Al/ })[0]).toBeInTheDocument()
        );
        fireEvent.click(screen.getAllByRole('button', { name: /Satın Al/ })[0]);
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Kredi Kartı ile Öde/ })).toBeInTheDocument()
        );
    });
});
```

- [ ] **Step 2: Testi çalıştır (kırmızı)**

Run: `npx vitest run src/test/Subscription.test.tsx`
Expected: FAIL — "Satın Al" butonu yok.

- [ ] **Step 3: import + formRef + scroll effect + selectPlan ekle**

`src/pages/dashboard/Subscription.tsx` — React import'una `useRef` ekle (`import React, { useState, useEffect, useRef } from 'react';`). Component gövdesine (state tanımlarının yanına) ekle:

```tsx
const formRef = useRef<HTMLDivElement>(null);

const selectPlan = (plan: SelectedPlan) => {
    setSelectedPlan(plan);
};

// Plan seçilince ödeme formuna yumuşak kaydır (form DOM'a girdikten sonra).
useEffect(() => {
    if (selectedPlan) {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}, [selectedPlan]);
```

- [ ] **Step 4: Tam Paket kartını `<div>` + "Satın Al" yap**

`src/pages/dashboard/Subscription.tsx` — Tam Paket `<button>` (satır 256-294) yerine:

```tsx
<div
    className={`w-full text-left rounded-xl p-5 border-2 mb-3 transition-all ${
        hasModule('excel_assistant') && hasModule('e_tebligat') && !subscription?.isTrial
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : selectedPlan === 'bundle'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-slate-700 bg-slate-800/50'
    }`}
>
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                TÜM MODÜLLER
            </span>
            {hasModule('excel_assistant') && hasModule('e_tebligat') && !subscription?.isTrial && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    AKTİF
                </span>
            )}
        </div>
        <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-white">6.000₺</span>
            <span className="text-slate-400 text-sm">/yıl</span>
            <span className="text-sm text-slate-500 line-through ml-1">7.500₺</span>
        </div>
    </div>
    <p className="text-sm font-semibold text-white mt-2">Tam Paket</p>
    <p className="text-xs text-emerald-400">1.500₺ tasarruf • 5.000 aylık kredi</p>
    {!(hasModule('excel_assistant') && hasModule('e_tebligat') && !subscription?.isTrial) && (
        <button
            type="button"
            onClick={() => selectPlan('bundle')}
            className="mt-3 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm transition-colors"
        >
            Satın Al →
        </button>
    )}
</div>
```

- [ ] **Step 5: Modül kartlarını `<div>` + "Satın Al" yap**

`src/pages/dashboard/Subscription.tsx` — `.map` içindeki `<button>` (satır 300-351) yerine:

```tsx
return (
    <div
        key={id}
        className={`text-left rounded-xl p-4 border-2 transition-all ${
            isActive
                ? `border-${mod.color}-500/30 bg-${mod.color}-500/5`
                : selectedPlan === id
                  ? `border-${mod.color}-500 bg-${mod.color}-500/10`
                  : 'border-slate-700 bg-slate-800/50'
        }`}
    >
        <div className="flex items-center justify-between mb-2">
            <span
                className={`text-xs font-semibold px-2 py-0.5 rounded bg-${mod.color}-500/20 text-${mod.color}-400`}
            >
                {isActive ? 'AKTİF' : 'MODÜL'}
            </span>
            <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-white">
                    {mod.price.toLocaleString('tr-TR')}₺
                </span>
                <span className="text-slate-400 text-xs">/yıl</span>
            </div>
        </div>
        <p className="text-sm font-semibold text-white">{mod.name}</p>
        <ul className="mt-2 space-y-1">
            {mod.features.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                    <svg
                        className={`w-3.5 h-3.5 text-${mod.color}-400 flex-shrink-0 mt-0.5`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    {f}
                </li>
            ))}
        </ul>
        {!isActive && (
            <button
                type="button"
                onClick={() => selectPlan(id)}
                className="mt-3 w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium text-sm transition-colors"
            >
                Satın Al →
            </button>
        )}
    </div>
);
```

- [ ] **Step 6: Ödeme formuna ref bağla**

`src/pages/dashboard/Subscription.tsx` — form wrapper'ı (satır 358-359):

```tsx
            {selectedPlan && (
                <div ref={formRef} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
```

- [ ] **Step 7: Testi çalıştır (yeşil)**

Run: `npx vitest run src/test/Subscription.test.tsx`
Expected: 2 test PASS.

- [ ] **Step 8: Tam suite + tip + lint**

Run: `npm test && npm run type-check`
Expected: tüm testler PASS, tip hatası yok.

- [ ] **Step 9: Commit**

```bash
git add src/pages/dashboard/Subscription.tsx src/test/Subscription.test.tsx
git commit -m "feat(funnel): /subscription kart içi görünür Satın Al butonu + forma scroll (P0)

Plan kartları div'e çevrildi, her birine açık 'Satın Al →' butonu; tıklayınca
plan seçilip ödeme formuna yumuşak kaydırır. Asıl huni sızıntısını kapatır.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- P0 → Task 5 ✓ (Satın Al butonları + scroll + form ref)
- P1 → Task 3 ✓ (dolmuş-trial kırmızı banner)
- P2 → Task 2 ✓ (7g/3x kadans + client-side expiry + count)
- P3 → Task 4 ✓ (getTrialBadge + Sidebar + Navbar)
- P4 → Task 1 ✓ (source=desktop)
- Test bölümü → her task'ta TDD adımları ✓
- Kapsam dışı maddeler → dokunulmadı ✓

**2. Placeholder scan:** Tüm adımlar gerçek kod içeriyor; TBD/TODO yok.

**3. Type consistency:** `WinbackState { shownAt, count }` T2'de tanımlı, `useUpgradeCTA`/`WinbackModal`/testler `count`'u tutarlı kullanıyor. `getTrialBadge` dönüş tipi `{ label, classes } | null` T4'te tanımlı, Sidebar aynı şekilde tüketiyor. `SelectedPlan` tipi (mevcut) `selectPlan`'da kullanılıyor.

**Notlar:**

- `main/` vitest kapsamı dışı → T1 ve T2'nin settings.js kısmı manuel/lint doğrulaması. T2'nin renderer kısmı (WinbackModal gate) vitest ile kapsanır.
- Dinamik Tailwind (`bg-${mod.color}-*`) yalnız mevcut (çalışan) pattern'de kullanıldı; yeni "Satın Al" butonları statik `bg-emerald-600`/`bg-sky-600` kullanır (purge riski yok).
- jsdom `scrollIntoView` implemente etmez → T5 testinde `Element.prototype.scrollIntoView = vi.fn()` ile stub'lanır.

## Rollout

- Sürüm: 1.9.15 → **1.9.16** (minor).
- Sıra: T1 → T2 → T3 → T4 → T5 (bağımsız; bu sıra küçükten büyüğe).
- Tüm task'lar + final review sonrası: `package.json` version bump → tag → build.
