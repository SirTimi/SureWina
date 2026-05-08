'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';

interface RemittanceCountdownProps {
  deadlineAt: string;
  owedNgn: number;
  overdue: boolean;
}

export function RemittanceCountdown({
  deadlineAt,
  owedNgn,
  overdue,
}: RemittanceCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // every 30s
    return () => clearInterval(t);
  }, []);

  if (owedNgn === 0) return null;

  const ms = new Date(deadlineAt).getTime() - now;
  const totalMins = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMins / 60);
  const minutes = totalMins % 60;

  let tone: 'green' | 'amber' | 'red';
  if (overdue || ms <= 0) tone = 'red';
  else if (totalMins < 120) tone = 'amber'; // less than 2 hours
  else tone = 'green';

  const toneStyles = {
    green: 'border-b border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-b border-amber-300 bg-amber-50 text-amber-900',
    red: 'border-b border-rose-300 bg-rose-50 text-rose-900',
  } as const;

  const Icon = tone === 'red' ? AlertTriangle : Clock;

  return (
    <Link
      href="/remittance"
      className={`flex items-center justify-between gap-3 px-4 py-2 transition hover:brightness-95 ${toneStyles[tone]}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <p className="truncate text-xs font-medium">
          {tone === 'red' ? (
            <>
              Remittance overdue · <span className="font-bold tabular-nums">{formatNaira(owedNgn)}</span>{' '}
              owed
            </>
          ) : ms <= 0 ? (
            <>
              Remittance due now · <span className="font-bold tabular-nums">{formatNaira(owedNgn)}</span>
            </>
          ) : (
            <>
              <span className="font-bold tabular-nums">{formatNaira(owedNgn)}</span> due in{' '}
              <span className="font-mono tabular-nums font-bold">
                {hours > 0 ? `${hours}h ` : ''}
                {minutes}m
              </span>
            </>
          )}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}