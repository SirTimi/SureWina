import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Primary = navy-800 = navigation, ownership actions, default CTAs
  primary:
    'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 border border-navy-800',
  // Accent = amber-500 = the ONE most important commercial CTA per page (e.g. "Buy a ticket")
  // Dark navy text on bright yellow — design palette specifies darker golden #E0A916
  // (amber-700) as the hover state, not a lighter yellow.
  accent:
    'bg-amber-500 text-navy-900 hover:bg-amber-700 active:bg-amber-500 border border-amber-500',
  // Secondary = white-with-border default
  secondary:
    'bg-white text-ink-950 hover:bg-ink-50 active:bg-ink-100 border border-ink-200',
  // Ghost = low-priority actions inside a dense surface
  ghost:
    'bg-transparent text-ink-950 hover:bg-ink-50 active:bg-ink-100 border border-transparent',
  danger:
    'bg-danger text-white hover:opacity-90 active:opacity-95 border border-danger',
  success:
    'bg-success text-white hover:opacity-90 active:opacity-95 border border-success',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-sm',
  md: 'h-11 px-5 text-base rounded',
  lg: 'h-12 px-6 text-base rounded-lg',
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
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <>
          <Spinner />
          {children}
        </>
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