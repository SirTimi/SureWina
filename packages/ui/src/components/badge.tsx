import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export type BadgeVariant =
  | 'default'    // ink/grey
  | 'daily'      // navy soft
  | 'jackpot'    // amber soft
  | 'live'       // success soft with dot
  | 'closed'     // ink soft
  | 'warning'    // warning soft
  | 'verified'   // success soft
  | 'primary'
  | 'success'
  | 'danger'
  | 'muted';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  withDot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-ink-50 text-ink-700',
  daily: 'bg-navy-50 text-navy-800',
  jackpot: 'bg-amber-100 text-amber-700',
  live: 'bg-success-bg text-success',
  closed: 'bg-ink-50 text-ink-500',
  warning: 'bg-warning-bg text-warning',
  verified: 'bg-success-bg text-success',
  primary: 'bg-navy-50 text-navy-800',
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  muted: 'bg-ink-50 text-ink-500',
};

const dotColor: Partial<Record<BadgeVariant, string>> = {
  live: 'bg-success',
  warning: 'bg-warning',
  verified: 'bg-success',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'default', withDot = false, className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium leading-none',
        variantStyles[variant],
        className,
      )}
      {...rest}
    >
      {withDot && dotColor[variant] && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full', dotColor[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
});