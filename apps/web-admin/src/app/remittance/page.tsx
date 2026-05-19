'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Ban, ListChecks, Wallet } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type RemittanceRecord } from '@/lib/admin-mock';

export default function RemittanceBoardPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const today = new Date().toISOString().slice(0, 10);
  const all = adminMock.listRemittances();
  const [view, setView] = useState<'TODAY' | 'DEFAULTERS' | 'ALL'>('TODAY');

  const rows = useMemo(() => {
    if (view === 'DEFAULTERS') return adminMock.listDefaulters();
    if (view === 'TODAY') return all.filter((r) => r.date === today);
    return all;
  }, [view, all, today]);

  const todays = all.filter((r) => r.date === today);
  const totalOwed = todays.reduce((s, r) => s + r.owedNgn, 0);
  const totalPaid = todays.reduce((s, r) => s + r.paidNgn, 0);
  const overdue = todays.filter((r) => r.status === 'OVERDUE').length;

  return (
    <>
      <PageHeader
        eyebrow="Remittance"
        title="Status board"
        description="Today's remittances across every agent. Defaulters get flagged and can be suspended."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Remittance' }]}
        rightSlot={
          <Link
            href="/remittance/reconcile"
            className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
          >
            <ListChecks className="h-4 w-4" />
            Manual reconciliation
          </Link>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={Wallet} label="Owed today" value={formatNaira(totalOwed)} />
          <KpiTile
            icon={Wallet}
            label="Paid so far"
            value={formatNaira(totalPaid)}
            tone="success"
          />
          <KpiTile
            icon={Ban}
            label="Overdue"
            value={String(overdue)}
            tone={overdue > 0 ? 'danger' : 'success'}
          />
          <KpiTile
            icon={ListChecks}
            label="Agents tracked"
            value={String(new Set(todays.map((r) => r.agentCode)).size)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['TODAY', 'DEFAULTERS', 'ALL'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                view === v
                  ? 'rounded-md bg-[#1A1816] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white'
                  : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 hover:bg-slate-50'
              }
            >
              {v}
            </button>
          ))}
        </div>

        <DataTable<RemittanceRecord>
          rows={rows}
          rowKey={(r) => r.remittanceId}
          searchPlaceholder="Search by agent code or name…"
          searchFn={(r, q) =>
            r.agentCode.toLowerCase().includes(q) ||
            r.agentName.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'agent',
              header: 'Agent',
              render: (r) => (
                <div>
                  <Link
                    href={`/agents/${r.agentCode}`}
                    className="font-bold text-[#1A1816] hover:text-navy-700"
                  >
                    {r.agentName}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{r.agentCode}</p>
                </div>
              ),
            },
            { key: 'date', header: 'Date', render: (r) => r.date },
            {
              key: 'owed',
              header: 'Owed',
              align: 'right',
              render: (r) => formatNaira(r.owedNgn),
            },
            {
              key: 'paid',
              header: 'Paid',
              align: 'right',
              render: (r) => formatNaira(r.paidNgn),
            },
            {
              key: 'gap',
              header: 'Gap',
              align: 'right',
              render: (r) =>
                r.owedNgn === r.paidNgn ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  <span className="font-bold text-red-700">
                    {formatNaira(r.owedNgn - r.paidNgn)}
                  </span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusPill tone={statusToTone(r.status)}>{r.status}</StatusPill>,
            },
            {
              key: 'receipt',
              header: 'Receipt',
              render: (r) =>
                r.receiptRef ? (
                  <span className="font-mono text-xs">{r.receiptRef}</span>
                ) : (
                  <Button
                    variant="secondary"
                    className="rounded-md border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    Flag / suspend
                  </Button>
                ),
            },
          ]}
        />
      </div>
    </>
  );
}
