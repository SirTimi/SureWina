'use client';

import { useState } from 'react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';

type LimitPeriod = 'WEEKLY' | 'MONTHLY' | 'NONE';

const presets: Record<LimitPeriod, { min: number; max: number; default: number }> = {
  WEEKLY: { min: 500, max: 25000, default: 5000 },
  MONTHLY: { min: 2000, max: 100000, default: 20000 },
  NONE: { min: 0, max: 0, default: 0 },
};

export function SpendLimitForm() {
  const [period, setPeriod] = useState<LimitPeriod>('MONTHLY');
  const [amount, setAmount] = useState(20000);

  const range = presets[period];

  return (
    <Card variant="default" className="p-6">
      <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
        Spend limit
      </p>
      <h2 className="font-display text-xl font-bold text-ink-950 mb-5">
        How much do you want to cap your tickets at?
      </h2>

      {/* Period toggle */}
      <div className="inline-flex border border-ink-200 rounded-md p-1 mb-6 bg-ink-50">
        {(['WEEKLY', 'MONTHLY', 'NONE'] as LimitPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPeriod(p);
              if (p !== 'NONE') {
                setAmount(presets[p].default);
              }
            }}
            className={
              period === p
                ? 'px-4 py-1.5 text-sm font-medium rounded bg-white text-navy-800 shadow-xs'
                : 'px-4 py-1.5 text-sm font-medium rounded text-ink-700 hover:text-ink-950'
            }
          >
            {p === 'WEEKLY' ? 'Weekly' : p === 'MONTHLY' ? 'Monthly' : 'No limit'}
          </button>
        ))}
      </div>

      {period !== 'NONE' && (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-sm text-ink-500">
              Cap per {period === 'WEEKLY' ? 'week' : 'month'}
            </span>
            <span className="font-display text-3xl font-bold text-ink-950 tabular-nums">
              {formatNaira(amount)}
            </span>
          </div>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={500}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value))}
            className="w-full accent-navy-800"
          />
          <div className="flex justify-between text-xs text-ink-500 mt-2 tabular-nums font-mono">
            <span>{formatNaira(range.min)}</span>
            <span>{formatNaira(range.max)}</span>
          </div>

          <div className="bg-ink-50 border border-ink-100 rounded-md p-4 mt-5">
            <p className="text-sm text-ink-700 leading-relaxed">
              Once you hit {formatNaira(amount)} in a{' '}
              {period === 'WEEKLY' ? 'week' : 'month'}, all purchases stop until the next period.
              You can lower this anytime; raising it has a 24-hour cool-down.
            </p>
          </div>
        </>
      )}

      {period === 'NONE' && (
        <div className="bg-warning-bg border border-warning/20 rounded-md p-4 mt-2">
          <p className="text-sm text-ink-700 leading-relaxed">
            No cap is in place. We strongly recommend setting one — it&apos;s one tap to change
            and it stays out of your way until you need it.
          </p>
        </div>
      )}

      <div className="mt-5">
        <Button variant="primary" size="md">
          Save limit
        </Button>
      </div>
    </Card>
  );
}