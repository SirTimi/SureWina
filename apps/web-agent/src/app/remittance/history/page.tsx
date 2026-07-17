'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { api } from '@/lib/api';

interface RemittanceRow {
  remittanceId: string;
  periodDate: string;
  grossSalesNgn: number;
  commissionNgn: number;
  amountDueNgn: number;
  ticketCount: number;
  status: string;
  bankTransferRef: string | null;
}

export default function RemittanceHistoryPage() {
  return (
    <AgentShell>
      {() => <HistoryBody />}
    </AgentShell>
  );
}

function HistoryBody() {
  const [items, setItems] = useState<RemittanceRow[] | null>(null);

  useEffect(() => {
    api.agents
      .remittanceHistory()
      .then((res) => setItems(res.remittances))
      .catch(() => setItems([]));
  }, []);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Remittance · History"
        title="Past remittances"
        description="Settlement dates, confirmation status, and any late flags."
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

function RemittanceCard({ item }: { item: RemittanceRow }) {
  const meta = statusMeta(item.status);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black text-navy-950">
            {new Date(item.periodDate).toLocaleDateString('en-NG', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.ticketCount} tickets · {formatNaira(item.grossSalesNgn)} gross
            {item.bankTransferRef && ` · Ref ${item.bankTransferRef}`}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 sm:gap-6">
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Amount due
            </p>
            <p className="font-display text-base font-black text-navy-950 tabular-nums">
              {formatNaira(item.amountDueNgn)}
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${meta.tone}`}
          >
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </span>
        </div>
      </div>
    </Card>
  );
}

function statusMeta(status: string): {
  tone: string;
  label: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'RECEIVED':
      return { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', label: 'Received', Icon: CheckCircle2 };
    case 'AGENT_CONFIRMED':
      return { tone: 'border-navy-200 bg-navy-50 text-navy-700', label: 'Awaiting finance', Icon: Hourglass };
    case 'LATE':
      return { tone: 'border-amber-200 bg-amber-50 text-amber-700', label: 'Late', Icon: AlertTriangle };
    case 'WRITTEN_OFF':
      return { tone: 'border-red-200 bg-red-50 text-red-700', label: 'Written off', Icon: AlertTriangle };
    case 'PENDING':
    default:
      return { tone: 'border-slate-200 bg-slate-50 text-slate-700', label: 'Pending', Icon: Clock };
  }
}