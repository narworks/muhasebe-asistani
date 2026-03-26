import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../components/ui/Button';

describe('Button', () => {
    it('renders children correctly', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click me</Button>);
        fireEvent.click(screen.getByText('Click me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', () => {
        const handleClick = vi.fn();
        render(
            <Button onClick={handleClick} disabled>
                Click me
            </Button>
        );
        fireEvent.click(screen.getByText('Click me'));
        expect(handleClick).not.toHaveBeenCalled();
    });

    it('applies primary variant styles', () => {
        render(<Button variant="primary">Primary</Button>);
        const button = screen.getByText('Primary');
        expect(button.className).toContain('bg-sky-500');
    });

    it('applies secondary variant styles', () => {
        render(<Button variant="secondary">Secondary</Button>);
        const button = screen.getByText('Secondary');
        expect(button.className).toContain('bg-slate-600');
    });

    it('applies danger variant styles', () => {
        render(<Button variant="danger">Danger</Button>);
        const button = screen.getByText('Danger');
        expect(button.className).toContain('bg-red-500');
    });

    it('applies ghost variant styles', () => {
        render(<Button variant="ghost">Ghost</Button>);
        const button = screen.getByText('Ghost');
        expect(button.className).toContain('bg-transparent');
    });

    it('applies size classes correctly', () => {
        const { rerender } = render(<Button size="sm">Small</Button>);
        expect(screen.getByText('Small').className).toContain('py-1.5');

        rerender(<Button size="lg">Large</Button>);
        expect(screen.getByText('Large').className).toContain('py-3');
    });

    it('has correct type attribute', () => {
        render(<Button type="submit">Submit</Button>);
        expect(screen.getByText('Submit')).toHaveAttribute('type', 'submit');
    });

    it('applies disabled styles when disabled', () => {
        render(<Button disabled>Disabled</Button>);
        const button = screen.getByText('Disabled');
        expect(button).toBeDisabled();
        expect(button.className).toContain('opacity-50');
    });
});
