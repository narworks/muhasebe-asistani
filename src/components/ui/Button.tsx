import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'google';
  size?: 'sm' | 'md' | 'lg';
}

const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-sm',
    md: 'py-2.5 px-4',
    lg: 'py-3 px-6 text-lg',
  };

  const variantClasses = {
    primary: 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-400 shadow-md',
    secondary: 'bg-slate-600 text-white hover:bg-slate-700 focus:ring-slate-500 shadow-md',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 shadow-md',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-700 hover:text-white focus:ring-slate-500',
    google: 'bg-white text-slate-700 hover:bg-slate-100 focus:ring-slate-400 border border-slate-300 shadow-md',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
