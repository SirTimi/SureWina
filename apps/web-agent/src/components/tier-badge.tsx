import type { AgentMe } from '@surewina/types';

interface TierBadgeProps {
  tier: AgentMe['tier'];
  size?: 'sm' | 'md';
}

const tierStyles: Record<AgentMe['tier'], { label: string; classes: string }> = {
  BRONZE: {
    label: 'Bronze',
    classes: 'border-orange-300 bg-orange-50 text-orange-800',
  },
  SILVER: {
    label: 'Silver',
    classes: 'border-slate-300 bg-slate-100 text-slate-700',
  },
  GOLD: {
    label: 'Gold',
    classes: 'border-amber-300 bg-amber-50 text-amber-800',
  },
};

export function TierBadge({ tier, size = 'sm' }: TierBadgeProps) {
  const style = tierStyles[tier];
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wider ${sizeClasses} ${style.classes}`}
    >
      {style.label}
    </span>
  );
}