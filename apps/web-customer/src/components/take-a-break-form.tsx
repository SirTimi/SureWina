'use client';

import { useState } from 'react';
import { Card } from '@surewina/ui';

type BreakDuration = '7d' | '30d' | '6mo' | 'permanent';

const options: { value: BreakDuration; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '6mo', label: '6 months' },
  { value: 'permanent', label: 'Permanent' },
];

export function TakeABreakForm() {
  const [selected, setSelected] = useState<BreakDuration | null>(null);

  return (
    <Card variant="default" className="p-6">
      <h2 className="font-display text-xl font-bold text-ink-950 mb-2">Take a break</h2>
      <p className="text-sm text-ink-500 mb-5 leading-relaxed">
        Pause your account for a fixed period. We won&apos;t sell you tickets, send promo SMS, or
        charge you.
      </p>

      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={
              selected === opt.value
                ? 'h-10 px-4 rounded-md bg-navy-800 text-white text-sm font-medium'
                : 'h-10 px-4 rounded-md bg-white border border-ink-200 text-ink-700 text-sm font-medium hover:bg-ink-50'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {selected === 'permanent' && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-4 mt-5">
          <p className="text-sm text-ink-700 leading-relaxed">
            <span className="font-semibold text-danger">Permanent self-exclusion</span> means
            your account is closed forever. You won&apos;t be able to register again with this
            phone number, ID, or BVN. This is a serious action — please consider a long break
            (6 months) first.
          </p>
        </div>
      )}
    </Card>
  );
}