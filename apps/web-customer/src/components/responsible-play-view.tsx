'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { UserMe } from '@surewina/types';
import { api } from '@/lib/api';

type LimitPeriod = 'WEEKLY' | 'MONTHLY' | 'NONE';

const presets: Record<LimitPeriod, { min: number; max: number; default: number }> = {
  WEEKLY: { min: 500, max: 25000, default: 5000 },
  MONTHLY: { min: 2000, max: 100000, default: 20000 },
  NONE: { min: 0, max: 0, default: 0 },
};

const breakOptions = [
  { value: '7d' as const, label: '7 days', days: 7 },
  { value: '30d' as const, label: '30 days', days: 30 },
  { value: '6mo' as const, label: '6 months', days: 180 },
  { value: 'permanent' as const, label: 'Permanent', days: null },
];

export function ResponsiblePlayView() {
  const [user, setUser] = useState<UserMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .getMe()
      .then(setUser)
      .catch((err) => setError(err.message ?? 'Could not load your settings.'));
  }, []);

  if (error) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-danger font-medium">{error}</p>
      </Card>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="h-64 bg-ink-100 rounded-lg animate-pulse" />
        <div className="h-32 bg-ink-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SpendLimitCard user={user} onUpdate={setUser} />
      <TakeABreakCard user={user} onUpdate={setUser} />
    </div>
  );
}

function SpendLimitCard({ user, onUpdate }: { user: UserMe; onUpdate: (u: UserMe) => void }) {
  const initialPeriod: LimitPeriod = user.spendLimit?.period ?? 'NONE';
  const initialAmount = user.spendLimit?.capNgn ?? presets.MONTHLY.default;

  const [period, setPeriod] = useState<LimitPeriod>(initialPeriod);
  const [amount, setAmount] = useState(initialAmount);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const range = presets[period];

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      let updated: UserMe;
      if (period === 'NONE') {
        updated = await api.account.removeSpendLimit({});
      } else {
        updated = await api.account.updateSpendLimit({ period, capNgn: amount });
      }
      onUpdate(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save limit.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card variant="default" className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
            Spend limit
          </p>
          <h2 className="font-display text-xl font-bold text-ink-950 mt-1">
            How much do you want to cap your tickets at?
          </h2>
        </div>
        {user.spendLimit && (
          <Badge variant="verified" withDot>
            Active
          </Badge>
        )}
      </div>

      {user.spendLimit && (
        <div className="bg-success-bg border border-success/20 rounded-md p-3 mb-5 text-sm text-ink-700">
          Current limit:{' '}
          <span className="font-semibold">
            {formatNaira(user.spendLimit.capNgn)} per{' '}
            {user.spendLimit.period === 'WEEKLY' ? 'week' : 'month'}
          </span>
        </div>
      )}

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

      {period === 'NONE' && user.spendLimit && (
        <div className="bg-warning-bg border border-warning/20 rounded-md p-4 mb-2 flex items-start gap-3">
          <Trash2 className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-700 leading-relaxed">
            Saving with &quot;No limit&quot; selected will{' '}
            <span className="font-semibold text-warning">remove your active spend cap</span>. We
            recommend keeping a limit in place. You can always raise it later.
          </div>
        </div>
      )}

      {period === 'NONE' && !user.spendLimit && (
        <div className="bg-warning-bg border border-warning/20 rounded-md p-4 mb-2">
          <p className="text-sm text-ink-700 leading-relaxed">
            No cap is in place. We strongly recommend setting one — it&apos;s one tap to change
            and it stays out of your way until you need it.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-3 mt-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleSave}
          isLoading={isSaving}
        >
          {isSaving
            ? 'Saving…'
            : period === 'NONE' && user.spendLimit
            ? 'Remove limit'
            : period === 'NONE'
            ? 'Save'
            : user.spendLimit
            ? 'Update limit'
            : 'Save limit'}
        </Button>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check className="w-4 h-4" />
            Saved
          </span>
        )}
      </div>
    </Card>
  );
}

function TakeABreakCard({
  user,
  onUpdate,
}: {
  user: UserMe;
  onUpdate: (u: UserMe) => void;
}) {
  const [selected, setSelected] = useState<typeof breakOptions[number]['value'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isOnBreak = user.selfExclusionUntil !== null;

  const handleStartBreak = async () => {
    if (!selected) return;
    setError(null);
    setIsSaving(true);
    try {
      const result = await api.account.requestBreak({ duration: selected });
      onUpdate({ ...user, selfExclusionUntil: result.selfExclusionUntil });
      setConfirming(false);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start break.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isOnBreak) {
    return (
      <Card variant="default" className="p-6">
        <h2 className="font-display text-xl font-bold text-ink-950 mb-2">Take a break</h2>
        <div className="bg-warning-bg border border-warning/20 rounded-md p-4 mt-4">
          <p className="text-sm text-ink-700 leading-relaxed">
            Your account is currently on a break until{' '}
            <span className="font-semibold">
              {new Date(user.selfExclusionUntil!).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            . You can&apos;t buy tickets during this period. To shorten the break, please contact
            support.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <h2 className="font-display text-xl font-bold text-ink-950 mb-2">Take a break</h2>
      <p className="text-sm text-ink-500 mb-5 leading-relaxed">
        Pause your account for a fixed period. We won&apos;t sell you tickets, send promo SMS, or
        charge you.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {breakOptions.map((opt) => (
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
        <div className="bg-danger-bg border border-danger/20 rounded-md p-4 mb-4">
          <p className="text-sm text-ink-700 leading-relaxed">
            <span className="font-semibold text-danger">Permanent self-exclusion</span> means
            your account is closed forever. You won&apos;t be able to register again with this
            phone number, ID, or BVN. This is a serious action — please consider a long break
            (6 months) first.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-md p-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-ink-700">{error}</p>
        </div>
      )}

      {selected && !confirming && (
        <Button
          type="button"
          variant={selected === 'permanent' ? 'danger' : 'primary'}
          size="md"
          onClick={() => setConfirming(true)}
        >
          Continue with {breakOptions.find((o) => o.value === selected)?.label.toLowerCase()} break
        </Button>
      )}

      {confirming && (
        <div className="bg-ink-50 border border-ink-200 rounded-md p-4 mt-2">
          <p className="text-sm text-ink-950 font-semibold mb-3">
            Are you sure?{' '}
            {selected === 'permanent'
              ? 'This is permanent and cannot be undone.'
              : `You won't be able to play for ${breakOptions.find((o) => o.value === selected)?.label.toLowerCase()}.`}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant={selected === 'permanent' ? 'danger' : 'primary'}
              size="md"
              onClick={handleStartBreak}
              isLoading={isSaving}
            >
              {isSaving ? 'Starting…' : 'Yes, start break'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                setConfirming(false);
                setSelected(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}