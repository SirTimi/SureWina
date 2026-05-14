type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet';

const toneStyles: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
};

interface StatusPillProps {
  tone?: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export function StatusPill({ tone = 'neutral', children, icon }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${toneStyles[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Common mapping helpers — many tables share the same status vocab. */
export function statusToTone(status: string): Tone {
  const s = status.toUpperCase();
  if (
    ['ACTIVE', 'PAID', 'DELIVERED', 'EXECUTED', 'PASSED', 'APPROVED', 'CLEARED'].includes(s)
  )
    return 'success';
  if (
    [
      'PENDING',
      'AWAITING_DOCS',
      'AWAITING_APPROVAL',
      'IN_REVIEW',
      'COMMITTED',
      'SCHEDULED',
      'ACCRUED',
      'OPEN',
      'DRAFT',
      'INVITED',
    ].includes(s)
  )
    return 'info';
  if (['LATE', 'WARNING', 'KYC', 'NOTIFIED', 'SELECTED', 'DISPATCHED', 'HELD', 'PAUSED'].includes(s))
    return 'warning';
  if (
    [
      'OVERDUE',
      'REJECTED',
      'FAILED',
      'FORFEITED',
      'TERMINATED',
      'SUSPENDED',
      'BLOCKED',
      'ESCALATED_NFIU',
      'CANCELLED',
      'VOIDED',
    ].includes(s)
  )
    return 'danger';
  return 'neutral';
}
