
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'google';
}

const Button: React.FC<ButtonProps> = ({ children, className = '', variant = 'primary', ...props }) => {
  const baseClasses = 'w-full flex items-center justify-center py-3 px-4 font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-opacity-75 transition-colors duration-300';

  const variantClasses = {
    primary: 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-400',
    secondary: 'bg-slate-600 text-white hover:bg-slate-700 focus:ring-slate-500',
    google: 'bg-white text-slate-700 hover:bg-slate-100 focus:ring-slate-400 border border-slate-300',
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export default Button;
