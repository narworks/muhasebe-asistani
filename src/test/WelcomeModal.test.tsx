import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WelcomeModal from '../components/onboarding/WelcomeModal';

describe('WelcomeModal', () => {
    const defaultProps = {
        isTrial: false,
        onClose: vi.fn(),
        onStart: vi.fn(),
    };

    it('ilk slide açılışta gösterilir', () => {
        render(<WelcomeModal {...defaultProps} />);
        expect(screen.getByText(/Hoşgeldiniz/)).toBeInTheDocument();
    });

    it('Trial kullanıcı için 🎁 badge gösterir', () => {
        render(<WelcomeModal {...defaultProps} isTrial trialDaysLeft={12} />);
        expect(screen.getByText(/12 gün ücretsiz deneme aktif/)).toBeInTheDocument();
    });

    it('Trial değilse badge gösterilmez', () => {
        render(<WelcomeModal {...defaultProps} isTrial={false} />);
        expect(screen.queryByText(/ücretsiz deneme aktif/)).not.toBeInTheDocument();
    });

    it("İleri butonu slide 2'ye geçirir", () => {
        render(<WelcomeModal {...defaultProps} />);
        fireEvent.click(screen.getByText(/İleri/));
        expect(screen.getByText(/E-Tebligat Nasıl Çalışır/)).toBeInTheDocument();
    });

    it("Slide 2'de 3 adımın hepsi görünür", () => {
        render(<WelcomeModal {...defaultProps} />);
        fireEvent.click(screen.getByText(/İleri/));
        expect(screen.getByText(/Mükelleflerinizi Ekleyin/)).toBeInTheDocument();
        expect(screen.getByText(/Keşif ile Önizleyin/)).toBeInTheDocument();
        expect(screen.getByText(/Tarayın/)).toBeInTheDocument();
    });

    it("Slide 3'te Başla butonu görünür", () => {
        render(<WelcomeModal {...defaultProps} />);
        fireEvent.click(screen.getByText(/İleri/));
        fireEvent.click(screen.getByText(/İleri/));
        expect(screen.getByText(/Başla →/)).toBeInTheDocument();
    });

    it('Başla butonuna basınca onStart çağrılır', () => {
        const onStart = vi.fn();
        render(<WelcomeModal {...defaultProps} onStart={onStart} />);
        fireEvent.click(screen.getByText(/İleri/));
        fireEvent.click(screen.getByText(/İleri/));
        fireEvent.click(screen.getByText(/Başla →/));
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('Atla butonuna basınca onClose çağrılır', () => {
        const onClose = vi.fn();
        render(<WelcomeModal {...defaultProps} onClose={onClose} />);
        fireEvent.click(screen.getByText(/Atla ✕/));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape tuşu onClose çağırır', () => {
        const onClose = vi.fn();
        render(<WelcomeModal {...defaultProps} onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Geri butonu slide 0'da devre dışı (disabled)", () => {
        render(<WelcomeModal {...defaultProps} />);
        const geri = screen.getByText(/Geri/);
        expect(geri).toBeDisabled();
    });

    it("Slide 2'de Geri butonu slide 1'e döner", () => {
        render(<WelcomeModal {...defaultProps} />);
        fireEvent.click(screen.getByText(/İleri/));
        fireEvent.click(screen.getByText(/İleri/));
        // slide 2'de
        expect(screen.getByText(/Başlayalım/)).toBeInTheDocument();
        fireEvent.click(screen.getByText(/← Geri/));
        // slide 1'e döndü
        expect(screen.getByText(/E-Tebligat Nasıl Çalışır/)).toBeInTheDocument();
    });

    it('Slide 3\'te trial user için "Deneme süresince" hatırlatması var', () => {
        render(<WelcomeModal {...defaultProps} isTrial trialDaysLeft={7} />);
        fireEvent.click(screen.getByText(/İleri/));
        fireEvent.click(screen.getByText(/İleri/));
        expect(
            screen.getByText(/20 mükellef · 500 kredi · Tüm modüller aktif/)
        ).toBeInTheDocument();
    });
});
