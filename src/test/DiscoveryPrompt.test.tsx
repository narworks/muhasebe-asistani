import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DiscoveryPrompt from '../components/onboarding/DiscoveryPrompt';

describe('DiscoveryPrompt', () => {
    const defaultProps = {
        onDismiss: vi.fn(),
        onStart: vi.fn(),
    };

    it('firmName verildiğinde başlıkta gösterir', () => {
        render(<DiscoveryPrompt {...defaultProps} firmName="Örnek Ltd." />);
        expect(screen.getByText(/Örnek Ltd\. eklendi!/)).toBeInTheDocument();
    });

    it('firmName verilmediğinde fallback başlığı gösterir', () => {
        render(<DiscoveryPrompt {...defaultProps} />);
        expect(screen.getByText(/İlk mükellefiniz eklendi!/)).toBeInTheDocument();
    });

    it('Keşif özelliği bilgilendirme bloğu var', () => {
        render(<DiscoveryPrompt {...defaultProps} />);
        expect(screen.getByText(/Sadece 10-15 saniye sürer/)).toBeInTheDocument();
        expect(screen.getByText(/Kredi harcanmaz/)).toBeInTheDocument();
    });

    it('Şimdi Keşif Başlat butonuna basınca onStart çağrılır', () => {
        const onStart = vi.fn();
        render(<DiscoveryPrompt {...defaultProps} onStart={onStart} />);
        fireEvent.click(screen.getByText(/Şimdi Keşif Başlat/));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('Sonra Yap butonuna basınca onDismiss çağrılır', () => {
        const onDismiss = vi.fn();
        render(<DiscoveryPrompt {...defaultProps} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByText(/Sonra Yap/));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('Escape tuşu onDismiss çağırır', () => {
        const onDismiss = vi.fn();
        render(<DiscoveryPrompt {...defaultProps} onDismiss={onDismiss} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("Şimdi Keşif Başlat butonu autoFocus'lu", () => {
        render(<DiscoveryPrompt {...defaultProps} />);
        const button = screen.getByText(/Şimdi Keşif Başlat/);
        expect(button).toHaveFocus();
    });
});
