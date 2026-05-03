import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4',
        className,
      )}
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 text-base text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}