import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/95',
  ghost: 'bg-transparent text-foreground hover:bg-muted/10 active:bg-muted/20',
  danger: 'bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/95',
  success: 'bg-success text-success-foreground hover:bg-success/90 active:bg-success/95',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-sm',
  md: 'h-11 px-4 text-base rounded',
  lg: 'h-12 px-6 text-lg rounded',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    isLoading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  } = props;

  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}