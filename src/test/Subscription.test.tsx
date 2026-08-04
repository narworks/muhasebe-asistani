import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Stable reference: the real AuthContext exposes currentUser via useState, so its
// identity only changes when the user actually changes. Returning a fresh object
// literal on every call here would make Subscription's
// `useEffect(() => fetchData(), [currentUser])` re-fire on every render (since the
// mock never signals a "real" update), spinning fetchData()/setFormData() in an
// infinite render loop that hangs the test.
const mockCurrentUser = { email: 'test@example.com' };
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ currentUser: mockCurrentUser }),
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

    it('paid kullanıcı (her iki modül sahibi) → "Satın Al" yok, AKTİF görünür', async () => {
        // @ts-expect-error mock
        window.electronAPI.getSubscriptionStatus.mockResolvedValue({
            isTrial: false,
            isActive: true,
            status: 'active',
            modules: ['excel_assistant', 'e_tebligat'],
        });
        render(<Subscription />);
        await waitFor(() => expect(screen.getAllByText('AKTİF').length).toBeGreaterThanOrEqual(1));
        expect(screen.queryAllByRole('button', { name: /Satın Al/ })).toHaveLength(0);
    });
});
