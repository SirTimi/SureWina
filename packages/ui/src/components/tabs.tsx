'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  children?: ReactNode;
  className?: string;
}

export function Tabs({ items, activeId, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-2 border-b border-ink-100', className)}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.id)}
            className={cn(
              'px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isActive
                ? 'text-navy-800 border-navy-800'
                : 'text-ink-500 border-transparent hover:text-ink-950 hover:border-ink-200',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-1.5 text-ink-300 tabular-nums">· {item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}