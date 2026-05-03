import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
};

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  function Container({ size = 'md', className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn('mx-auto px-4 sm:px-6', sizeStyles[size], className)}
        {...rest}
      />
    );
  },
);