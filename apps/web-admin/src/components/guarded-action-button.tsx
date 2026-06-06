'use client';

import { Lock } from 'lucide-react';
import { Button } from '@surewina/ui';
import {
  type AdminAction,
  type AdminSession,
  canPerformAdminAction,
  getAdminActionDeniedReason,
} from '@/lib/admin-auth';
import { createAuditLogEntry, type AuditAction, type AuditModule } from '@/lib/audit-log-mock';

interface GuardedActionButtonProps {
  session: AdminSession;
  action: AdminAction;
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'accent' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  hideWhenDenied?: boolean;
  audit?: {
    module: AuditModule;
    action: AuditAction;
    target: string;
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
};
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
  audit,
  onClick,
}: GuardedActionButtonProps) {
  const allowed = canPerformAdminAction(session.role, action);

  if (!allowed && hideWhenDenied) return null;

  if (!allowed) {
    return (
      <button
        type="button"
        disabled
        title={getAdminActionDeniedReason(session.role, action)}
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
    if (audit) {
      createAuditLogEntry({
        module: audit.module,
        action: audit.action,
        actorName: session.fullName,
        actorEmail: session.email,
        actorRole: session.role,
        target: audit.target,
        oldValue: audit.oldValue ?? null,
        newValue: audit.newValue ?? null,
        reason: audit.reason ?? 'Frontend mock action triggered',
        severity:
          audit.action.includes('REJECTED') || audit.action.includes('REVOKED')
            ? 'DANGER'
            : audit.action.includes('APPROVED')
              ? 'SUCCESS'
              : 'INFO',
      });
    }

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