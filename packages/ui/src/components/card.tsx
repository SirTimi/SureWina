import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'flat' | 'dark';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', className, ...rest },
  ref,
) {
  const variantStyles = {
    default: 'bg-white border border-ink-100 rounded-lg',
    elevated: 'bg-white border border-ink-100 rounded-lg shadow-md',
    flat: 'bg-white rounded-lg',
    dark: 'bg-navy-900 text-white border border-navy-800 rounded-lg',
  };

  return (
    <div
      ref={ref}
      className={cn(variantStyles[variant], className)}
      {...rest}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('p-6 pb-4', className)} {...rest} />;
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return <div ref={ref} className={cn('p-6 pt-0', className)} {...rest} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div ref={ref} className={cn('p-6 pt-4 border-t border-ink-100', className)} {...rest} />
    );
  },
);