import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    count?: number;
}

const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'text',
    width,
    height,
    count = 1,
}) => {
    const baseClasses = 'animate-pulse bg-slate-700';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg',
    };

    const style: React.CSSProperties = {
        width: width ?? (variant === 'text' ? '100%' : undefined),
        height: height ?? (variant === 'text' ? '1rem' : undefined),
    };

    const elements = Array.from({ length: count }, (_, index) => (
        <div
            key={index}
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    ));

    if (count === 1) {
        return elements[0];
    }

    return <div className="space-y-2">{elements}</div>;
};

// Pre-built skeleton components for common use cases
export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`bg-slate-800 rounded-xl p-6 ${className}`}>
        <Skeleton variant="text" height="1.5rem" width="60%" className="mb-4" />
        <Skeleton variant="text" count={3} className="mb-2" />
        <div className="flex gap-2 mt-4">
            <Skeleton variant="rectangular" width={80} height={36} />
            <Skeleton variant="rectangular" width={80} height={36} />
        </div>
    </div>
);

export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 5 }) => (
    <tr className="border-t border-slate-700">
        {Array.from({ length: columns }, (_, i) => (
            <td key={i} className="px-4 py-3">
                <Skeleton variant="text" height="0.875rem" />
            </td>
        ))}
    </tr>
);

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
    rows = 5,
    columns = 5,
}) => (
    <div className="overflow-x-auto">
        <table className="min-w-full">
            <thead className="bg-slate-800">
                <tr>
                    {Array.from({ length: columns }, (_, i) => (
                        <th key={i} className="px-4 py-3">
                            <Skeleton variant="text" height="0.75rem" width="80%" />
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {Array.from({ length: rows }, (_, i) => (
                    <TableRowSkeleton key={i} columns={columns} />
                ))}
            </tbody>
        </table>
    </div>
);

export const StatCardSkeleton: React.FC = () => (
    <div className="bg-slate-800 rounded-xl p-4">
        <Skeleton variant="text" height="0.75rem" width="50%" className="mb-2" />
        <Skeleton variant="text" height="2rem" width="40%" />
    </div>
);

export const StatGridSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: count }, (_, i) => (
            <StatCardSkeleton key={i} />
        ))}
    </div>
);

export default Skeleton;
