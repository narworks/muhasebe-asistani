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
