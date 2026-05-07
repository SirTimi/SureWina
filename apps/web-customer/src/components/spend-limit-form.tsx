'use client';

import { useState } from 'react';
import { AlertTriangle, Check, WalletCards } from 'lucide-react';
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
    <Card
      variant="default"
      className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
    >
      <div className="border-b border-slate-100 bg-white p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
            <WalletCards className="h-6 w-6" />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
              Spend limit
            </p>

            <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
              How much do you want to cap your tickets at?
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Once the cap is reached, ticket purchases should stop until the next
              period. Lowering a limit should take effect immediately.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-7">
        <div className="inline-flex flex-wrap gap-1 rounded-sm border border-[#4E8F01]/15 bg-[#F8FAF4] p-1">
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
                  ? 'rounded-sm bg-[#4E8F01] px-4 py-2 text-sm font-bold text-white shadow-sm'
                  : 'rounded-sm px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-[#A8E368]/15 hover:text-[#4E8F01]'
              }
            >
              {p === 'WEEKLY' ? 'Weekly' : p === 'MONTHLY' ? 'Monthly' : 'No limit'}
            </button>
          ))}
        </div>

        {period !== 'NONE' && (
          <>
            <div className="mt-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-bold text-slate-500">
                  Cap per {period === 'WEEKLY' ? 'week' : 'month'}
                </p>

                <p className="mt-1 font-display text-4xl font-black tracking-[-0.04em] text-navy-950 tabular-nums">
                  {formatNaira(amount)}
                </p>
              </div>

              <div className="rounded-sm bg-[#A8E368]/20 px-3 py-2 text-xs font-bold text-[#4E8F01]">
                {period === 'WEEKLY' ? 'Weekly control' : 'Monthly control'}
              </div>
            </div>

            <input
              type="range"
              min={range.min}
              max={range.max}
              step={500}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value))}
              className="mt-6 w-full accent-[#4E8F01]"
            />

            <div className="mt-2 flex justify-between font-mono text-xs text-slate-500 tabular-nums">
              <span>{formatNaira(range.min)}</span>
              <span>{formatNaira(range.max)}</span>
            </div>

            <div className="mt-6 rounded-2xl border border-[#4E8F01]/15 bg-[#F8FAF4] p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4E8F01] text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>

                <p className="text-sm leading-relaxed text-slate-700">
                  Once you hit {formatNaira(amount)} in a{' '}
                  {period === 'WEEKLY' ? 'week' : 'month'}, purchases are blocked until
                  the next period. Lowering this should be instant; raising it should have
                  a cool-down.
                </p>
              </div>
            </div>
          </>
        )}

        {period === 'NONE' && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

              <p className="text-sm leading-relaxed text-slate-700">
                No cap is in place. That is not the best default. Set a limit that keeps
                this as entertainment, not pressure.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            className="rounded-sm !border-transparent bg-[#4E8F01] font-bold text-white hover:!border-transparent hover:bg-[#3f7601]"
          >
            Save limit
          </Button>
        </div>
      </div>
    </Card>
  );
}