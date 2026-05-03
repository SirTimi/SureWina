import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  variant?: 'default' | 'highlight';
}

export const Stat = forwardRef<HTMLDivElement, StatProps>(function Stat(
  { label, value, hint, variant = 'default', className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border p-5',
        variant === 'highlight'
          ? 'bg-amber-50 border-amber-100'
          : 'bg-white border-ink-100',
        className,
      )}
      {...rest}
    >
      <p
        className={cn(
          'text-[10px] uppercase tracking-wider font-semibold mb-2',
          variant === 'highlight' ? 'text-amber-700' : 'text-ink-500',
        )}
      >
        {label}
      </p>
      <p className="text-2xl font-display font-bold text-ink-950 tabular-nums leading-tight">
        {value}
      </p>
      {hint && <p className="text-xs text-ink-500 mt-1.5">{hint}</p>}
    </div>
  );
});