import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

const Button: React.FC<ButtonProps> = ({ variant = 'primary', className = '', ...props }) => {
  const base =
    'w-full py-4 rounded-2xl font-semibold text-lg shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-purple-300 cursor-pointer disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-gradient-to-r from-purple-400 to-blue-400 text-white hover:from-purple-500 hover:to-blue-500',
    secondary:
      'bg-white text-purple-700 border border-purple-300 hover:bg-purple-50',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
};

export default Button; 