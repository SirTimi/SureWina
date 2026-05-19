'use client';

import { useState } from 'react';
import { AlertTriangle, PauseCircle, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@surewina/ui';

type BreakDuration = '7d' | '30d' | '6mo' | 'permanent';

const options: { value: BreakDuration; label: string; note: string }[] = [
  { value: '7d', label: '7 days', note: 'Short reset' },
  { value: '30d', label: '30 days', note: 'Monthly break' },
  { value: '6mo', label: '6 months', note: 'Long pause' },
  { value: 'permanent', label: 'Permanent', note: 'Cannot be reversed' },
];

export function TakeABreakForm() {
  const [selected, setSelected] = useState<BreakDuration | null>(null);

  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
    >
      <div className="border-b border-slate-100 bg-white p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <PauseCircle className="h-6 w-6" />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Self-exclusion
            </p>

            <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
              Take a break from ticket purchases.
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Choose a break period. During the break, ticket purchases should be blocked
              and promotional messages should stop where applicable.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={
                selected === opt.value
                  ? 'rounded-2xl border-2 border-navy-700 bg-amber-50 p-4 text-left'
                  : 'rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-amber-500 hover:bg-[#F8FAF4]'
              }
            >
              <span className="block text-sm font-black text-navy-950">
                {opt.label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                {opt.note}
              </span>
            </button>
          ))}
        </div>

        {selected && selected !== 'permanent' && (
          <div className="mt-6 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" />

              <p className="text-sm leading-relaxed text-slate-700">
                You selected a{' '}
                <span className="font-bold text-navy-950">
                  {options.find((o) => o.value === selected)?.label}
                </span>{' '}
                break. During this period, purchases should be blocked.
              </p>
            </div>
          </div>
        )}

        {selected === 'permanent' && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

              <p className="text-sm leading-relaxed text-slate-700">
                <span className="font-black text-red-700">
                  Permanent self-exclusion is serious.
                </span>{' '}
                It should close ticket purchasing permanently for this identity. Consider
                a 6-month break first unless you are certain.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            disabled={!selected}
            className="rounded-sm !border-transparent bg-navy-800 font-bold text-white hover:!border-transparent hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Activate break
          </Button>
        </div>
      </div>
    </Card>
  );
}