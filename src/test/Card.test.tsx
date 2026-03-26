import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from '../components/ui/Card';

describe('Card', () => {
    it('renders children correctly', () => {
        render(<Card>Card content</Card>);
        expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('applies default styles', () => {
        render(<Card>Content</Card>);
        const card = screen.getByText('Content').closest('div');
        expect(card?.className).toContain('bg-slate-800');
        expect(card?.className).toContain('rounded-xl');
        expect(card?.className).toContain('shadow-lg');
        expect(card?.className).toContain('p-6');
    });

    it('accepts custom className', () => {
        render(<Card className="custom-class">Content</Card>);
        const card = screen.getByText('Content').closest('div');
        expect(card?.className).toContain('custom-class');
    });

    it('renders complex children', () => {
        render(
            <Card>
                <h2>Title</h2>
                <p>Description</p>
            </Card>
        );
        expect(screen.getByText('Title')).toBeInTheDocument();
        expect(screen.getByText('Description')).toBeInTheDocument();
    });
});
