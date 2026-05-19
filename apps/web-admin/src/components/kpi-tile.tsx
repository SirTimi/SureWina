import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; positive: boolean };
  tone?: 'default' | 'success' | 'warning' | 'danger';
  rightSlot?: React.ReactNode;
}

export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  tone = 'default',
  rightSlot,
}: KpiTileProps) {
  const tones = {
    default: 'bg-white border-slate-200 text-[#1A1816]',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
  } as const;

  const iconTones = {
    default: 'bg-navy-50 text-navy-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  } as const;

  return (
    <div className={`flex h-full flex-col rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${iconTones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        {rightSlot}
      </div>

      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] opacity-60">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black leading-tight tracking-[-0.03em]">
        {value}
      </p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && (
          <span
            className={`inline-flex items-center gap-1 font-bold ${delta.positive ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {delta.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
