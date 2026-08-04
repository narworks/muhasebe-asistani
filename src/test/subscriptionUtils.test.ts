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
