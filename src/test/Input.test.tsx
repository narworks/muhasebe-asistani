import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from '../components/ui/Input';

describe('Input', () => {
    it('renders label correctly', () => {
        render(<Input id="test" label="Test Label" />);
        expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('renders input with correct id', () => {
        render(<Input id="test-input" label="Test" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('id', 'test-input');
    });

    it('associates label with input', () => {
        render(<Input id="email" label="Email" />);
        const label = screen.getByText('Email');
        expect(label).toHaveAttribute('for', 'email');
    });

    it('handles onChange events', () => {
        const handleChange = vi.fn();
        render(<Input id="test" label="Test" onChange={handleChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test value' } });
        expect(handleChange).toHaveBeenCalled();
    });

    it('displays error message when error prop is provided', () => {
        render(<Input id="test" label="Test" error="This field is required" />);
        expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('sets aria-invalid to true when error exists', () => {
        render(<Input id="test" label="Test" error="Error" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
        render(<Input id="test" label="Test" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
    });

    it('sets aria-describedby when error exists', () => {
        render(<Input id="test" label="Test" error="Error message" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'test-error');
    });

    it('error message has correct id for aria-describedby', () => {
        render(<Input id="test" label="Test" error="Error message" />);
        const errorMessage = screen.getByText('Error message');
        expect(errorMessage).toHaveAttribute('id', 'test-error');
    });

    it('applies error styles when error exists', () => {
        render(<Input id="test" label="Test" error="Error" />);
        const input = screen.getByRole('textbox');
        expect(input.className).toContain('border-red-500');
    });

    it('applies normal styles when no error', () => {
        render(<Input id="test" label="Test" />);
        const input = screen.getByRole('textbox');
        expect(input.className).toContain('border-slate-600');
    });

    it('passes through additional props', () => {
        render(<Input id="test" label="Test" placeholder="Enter text" disabled />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('placeholder', 'Enter text');
        expect(input).toBeDisabled();
    });

    it('accepts custom className', () => {
        render(<Input id="test" label="Test" className="custom-class" />);
        const input = screen.getByRole('textbox');
        expect(input.className).toContain('custom-class');
    });
});
