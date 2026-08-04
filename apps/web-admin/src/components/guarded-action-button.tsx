'use client';

import { Lock } from 'lucide-react';
import { Button } from '@surewina/ui';
import {
  type AdminAction,
  type AdminSession,
  canPerformAction,
  getActionDeniedReason,
} from '@/lib/admin-auth';

interface GuardedActionButtonProps {
  session: AdminSession;
  action: AdminAction;
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'accent' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  hideWhenDenied?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}

export function GuardedActionButton({
  session,
  action,
  children,
  icon,
  variant = 'secondary',
  size = 'sm',
  className,
  hideWhenDenied = false,
  disabled = false,
  isLoading = false,
  onClick,
}: GuardedActionButtonProps) {
  const allowed = canPerformAction(session, action);
  if (!allowed && hideWhenDenied) return null;

  if (!allowed) {
    return (
      <button
        type="button"
        disabled
        title={getActionDeniedReason(session, action)}
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-400"
      >
        <Lock className="h-4 w-4" />
        {children}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled}
      isLoading={isLoading}
      onClick={onClick}
      className={className}
    >
      {icon}
      {children}
    </Button>
  );
}