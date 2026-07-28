'use client';

import { Lock } from 'lucide-react';
import { Button } from '@surewina/ui';
import {
  type AdminAction,
  type AdminSession,
  canPerformAdminAction,
  getAdminActionDeniedReason,
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
  onClick,
}: GuardedActionButtonProps) {
  const allowed = canPerformAdminAction(session.tier, action);

  if (!allowed && hideWhenDenied) return null;

  if (!allowed) {
    return (
      <button
        type="button"
        disabled
        title={getAdminActionDeniedReason(session.tier, action)}
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
  onClick={() => {
    onClick?.();
  }}
  className={className}
  title="Frontend permission allowed. Backend enforcement will be added later."
>
      {icon}
      {children}
    </Button>
  );
}