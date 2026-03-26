import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton, { CardSkeleton, TableSkeleton, StatGridSkeleton } from '../components/ui/Skeleton';

describe('Skeleton', () => {
    it('renders with default variant (text)', () => {
        const { container } = render(<Skeleton />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton?.className).toContain('animate-pulse');
        expect(skeleton?.className).toContain('bg-slate-700');
        expect(skeleton?.className).toContain('rounded');
    });

    it('renders circular variant', () => {
        const { container } = render(<Skeleton variant="circular" />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton?.className).toContain('rounded-full');
    });

    it('renders rectangular variant', () => {
        const { container } = render(<Skeleton variant="rectangular" />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton?.className).toContain('rounded-lg');
    });

    it('applies custom width and height', () => {
        const { container } = render(<Skeleton width={100} height={50} />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton).toHaveStyle({ width: '100px', height: '50px' });
    });

    it('applies string width and height', () => {
        const { container } = render(<Skeleton width="50%" height="2rem" />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton).toHaveStyle({ width: '50%', height: '2rem' });
    });

    it('renders multiple skeletons when count > 1', () => {
        const { container } = render(<Skeleton count={3} />);
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBe(3);
    });

    it('wraps multiple skeletons in space-y-2 container', () => {
        const { container } = render(<Skeleton count={2} />);
        const wrapper = container.querySelector('.space-y-2');
        expect(wrapper).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Skeleton className="custom-class" />);
        const skeleton = container.querySelector('.animate-pulse');
        expect(skeleton?.className).toContain('custom-class');
    });
});

describe('CardSkeleton', () => {
    it('renders card skeleton structure', () => {
        const { container } = render(<CardSkeleton />);
        expect(container.querySelector('.bg-slate-800')).toBeInTheDocument();
        expect(container.querySelector('.rounded-xl')).toBeInTheDocument();
    });

    it('accepts custom className', () => {
        const { container } = render(<CardSkeleton className="mt-4" />);
        expect(container.querySelector('.mt-4')).toBeInTheDocument();
    });
});

describe('TableSkeleton', () => {
    it('renders default 5 rows', () => {
        render(<TableSkeleton />);
        const rows = screen.getAllByRole('row');
        // 1 header row + 5 body rows
        expect(rows.length).toBe(6);
    });

    it('renders custom number of rows', () => {
        render(<TableSkeleton rows={3} />);
        const rows = screen.getAllByRole('row');
        // 1 header row + 3 body rows
        expect(rows.length).toBe(4);
    });

    it('renders default 5 columns', () => {
        render(<TableSkeleton rows={1} />);
        const headerCells = screen.getAllByRole('columnheader');
        expect(headerCells.length).toBe(5);
    });

    it('renders custom number of columns', () => {
        render(<TableSkeleton rows={1} columns={3} />);
        const headerCells = screen.getAllByRole('columnheader');
        expect(headerCells.length).toBe(3);
    });
});

describe('StatGridSkeleton', () => {
    it('renders default 4 stat cards', () => {
        const { container } = render(<StatGridSkeleton />);
        const statCards = container.querySelectorAll('.bg-slate-800');
        expect(statCards.length).toBe(4);
    });

    it('renders custom count of stat cards', () => {
        const { container } = render(<StatGridSkeleton count={6} />);
        const statCards = container.querySelectorAll('.bg-slate-800');
        expect(statCards.length).toBe(6);
    });

    it('has grid layout classes', () => {
        const { container } = render(<StatGridSkeleton />);
        const grid = container.querySelector('.grid');
        expect(grid?.className).toContain('grid-cols-2');
        expect(grid?.className).toContain('md:grid-cols-4');
    });
});
