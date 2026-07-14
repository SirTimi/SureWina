'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Check, WalletCards } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';

type LimitPeriod = 'WEEKLY' | 'MONTHLY' | 'NONE';

const presets: Record<LimitPeriod, { min: number; max: number; default: number }> = {
  WEEKLY: { min: 500, max: 25000, default: 5000 },
  MONTHLY: { min: 2000, max: 100000, default: 20000 },
  NONE: { min: 0, max: 0, default: 0 },
};

export function SpendLimitForm() {
  const [period, setPeriod] = useState<LimitPeriod>('MONTHLY');
  const [amount, setAmount] = useState(20000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const range = presets[period];

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      if (period === 'NONE') {
        await api.account.removeSpendLimit({});
      } else {
        await api.account.updateSpendLimit({ period, capNgn: amount });
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save limit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
    >
      <div className="border-b border-slate-100 bg-white p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <WalletCards className="h-6 w-6" />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
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
        <div className="inline-flex flex-wrap gap-1 rounded-sm border border-navy-100 bg-[#F8FAF4] p-1">
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
                  ? 'rounded-sm bg-navy-800 px-4 py-2 text-sm font-bold text-white shadow-sm'
                  : 'rounded-sm px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-amber-50 hover:text-navy-700'
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

              <div className="rounded-sm bg-amber-50 px-3 py-2 text-xs font-bold text-navy-700">
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
              className="mt-6 w-full accent-navy-700"
            />

            <div className="mt-2 flex justify-between font-mono text-xs text-slate-500 tabular-nums">
              <span>{formatNaira(range.min)}</span>
              <span>{formatNaira(range.max)}</span>
            </div>

            <div className="mt-6 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-white">
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

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm leading-relaxed text-red-700">{error}</p>
          </div>
        )}

        {saved && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-navy-100 bg-amber-50 p-4">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
            <p className="text-sm leading-relaxed text-navy-950">Limit saved.</p>
          </div>
        )}

        <div className="mt-6">
          <Button
            onClick={handleSave}
            isLoading={saving}
            disabled={saving}
            variant="primary"
            size="md"
            className="rounded-sm !border-transparent bg-navy-800 font-bold text-white hover:!border-transparent hover:bg-navy-800"
          >
            Save limit
          </Button>
        </div>
      </div>
    </Card>
  );
}