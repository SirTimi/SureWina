'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock, type RemittancePayment } from '@/lib/agent-mock';

export default function RemittanceHistoryPage() {
  return (
    <AgentShell>
      {() => <HistoryBody />}
    </AgentShell>
  );
}

function HistoryBody() {
  const [items, setItems] = useState<RemittancePayment[] | null>(null);

  useEffect(() => {
    agentMock.listRemittanceHistory().then(setItems);
  }, []);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Remittance · History"
        title="Past remittances"
        description="Receipts, settlement dates, and any late flags."
        backHref="/remittance"
      />

      {!items ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="rounded-3xl border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No remittance history yet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {items.map((item) => (
            <RemittanceCard key={item.remittanceId} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

function RemittanceCard({ item }: { item: RemittancePayment }) {
  const tone =
    item.status === 'PAID'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : item.status === 'LATE'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : item.status === 'PENDING'
          ? 'border-slate-200 bg-slate-50 text-slate-700'
          : 'border-red-200 bg-red-50 text-red-700';

  const Icon =
    item.status === 'PAID'
      ? CheckCircle2
      : item.status === 'LATE'
        ? AlertTriangle
        : Clock;

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black text-navy-950">{item.reference}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Period{' '}
            {new Date(item.periodStart).toLocaleDateString('en-NG', {
              day: '2-digit',
              month: 'short',
            })}
            {item.bankReceiptRef && ` · Receipt ${item.bankReceiptRef}`}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:gap-6">
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Settled
            </p>
            <p className="font-display text-base font-black text-navy-950 tabular-nums">
              {formatNaira(item.paidNgn)}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tone}`}
          >
            <Icon className="h-3 w-3" />
            {item.status}
          </span>
        </div>
      </div>
    </Card>
  );
}
