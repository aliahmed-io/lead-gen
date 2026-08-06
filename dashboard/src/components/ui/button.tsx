'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ElementType;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  style = {},
  ...props
}) => {
  let sizeStyles: React.CSSProperties = { padding: '8px 16px', fontSize: '13px' };
  if (size === 'sm') sizeStyles = { padding: '6px 12px', fontSize: '11px' };
  if (size === 'lg') sizeStyles = { padding: '12px 24px', fontSize: '14px' };

  let baseClass = 'btn btn-secondary';
  if (variant === 'primary') baseClass = 'btn btn-primary';
  if (variant === 'danger') baseClass = 'btn btn-danger';
  if (variant === 'ghost') baseClass = 'btn-ghost';

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClass} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        borderRadius: '10px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'all 0.15s ease',
        ...sizeStyles,
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 12 : 14} />
      ) : null}
      {children}
    </button>
  );
};
