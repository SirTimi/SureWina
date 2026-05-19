'use client';

import Link from 'next/link';
import { Coins, Download, PlayCircle } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type CommissionLedgerEntry } from '@/lib/admin-mock';

export default function CommissionLedgerPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listCommissionLedger();
  const accrued = rows.filter((r) => r.status === 'ACCRUED');
  const accruedSum = accrued.reduce((s, r) => s + r.commissionNgn + r.overrideNgn, 0);
  const disbursed = rows
    .filter((r) => r.status === 'DISBURSED')
    .reduce((s, r) => s + r.commissionNgn + r.overrideNgn, 0);
  const held = rows
    .filter((r) => r.status === 'HELD')
    .reduce((s, r) => s + r.commissionNgn + r.overrideNgn, 0);

  const download = () => {
    const csv = [
      'date,agent_code,agent_name,basis_ngn,rate,commission_ngn,override_ngn,status',
      ...rows.map(
        (r) =>
          `${r.date},${r.agentCode},${r.agentName},${r.basisNgn},${r.rate},${r.commissionNgn},${r.overrideNgn},${r.status}`,
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Commission"
        title="Commission ledger"
        description="Every commission accrual, override, hold, and disbursement across the agent network."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Commission' }]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={download}
              className="rounded-md border-slate-200 bg-white text-[#0B1220]"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Link
              href="/commission/run"
              className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
            >
              <PlayCircle className="h-4 w-4" />
              Run disbursement
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KpiTile
            icon={Coins}
            label="Accrued (ready)"
            value={formatNaira(accruedSum)}
            tone="success"
          />
          <KpiTile icon={Coins} label="Disbursed (lifetime)" value={formatNaira(disbursed)} />
          <KpiTile
            icon={Coins}
            label="On hold"
            value={formatNaira(held)}
            tone={held > 0 ? 'warning' : 'default'}
          />
        </div>

        <DataTable<CommissionLedgerEntry>
          rows={rows}
          rowKey={(r) => r.entryId}
          searchPlaceholder="Search agent…"
          searchFn={(r, q) =>
            r.agentName.toLowerCase().includes(q) ||
            r.agentCode.toLowerCase().includes(q)
          }
          columns={[
            { key: 'date', header: 'Date', render: (r) => r.date },
            {
              key: 'agent',
              header: 'Agent',
              render: (r) => (
                <div>
                  <Link
                    href={`/agents/${r.agentCode}`}
                    className="font-bold text-[#0B1220] hover:text-navy-700"
                  >
                    {r.agentName}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{r.agentCode}</p>
                </div>
              ),
            },
            { key: 'basis', header: 'Basis', align: 'right', render: (r) => formatNaira(r.basisNgn) },
            {
              key: 'rate',
              header: 'Rate',
              align: 'right',
              render: (r) => `${(r.rate * 100).toFixed(0)}%`,
            },
            {
              key: 'comm',
              header: 'Commission',
              align: 'right',
              render: (r) => (
                <span className="font-bold text-navy-700">
                  {formatNaira(r.commissionNgn)}
                </span>
              ),
            },
            {
              key: 'override',
              header: 'Override',
              align: 'right',
              render: (r) =>
                r.overrideNgn > 0 ? formatNaira(r.overrideNgn) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <StatusPill tone={statusToTone(r.status)}>{r.status}</StatusPill>,
            },
          ]}
        />
      </div>
    </>
  );
}
