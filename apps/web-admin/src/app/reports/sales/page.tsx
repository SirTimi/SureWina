'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

type ReportPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YTD';

const periodTabs: Array<{ key: ReportPeriod; label: string }> = [
  { key: 'DAILY', label: 'Daily' },
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YTD', label: 'YTD' },
];

export default function SalesReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [period, setPeriod] = useState<ReportPeriod>('DAILY');
  const breakdown = adminMock.getStateBreakdown();
  const total = breakdown.reduce((s, b) => s + b.tickets, 0);
  const totalNgn = breakdown.reduce((s, b) => s + b.salesNgn, 0);
  const rows = useMemo(() => buildReportRows(period, breakdown), [period, breakdown]);
  const columns = getColumns(period);

  const download = () => {
    const csv = [
      columns.map((c) => c.csvKey).join(','),
      ...rows.map((row) => columns.map((c) => row[c.key]).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Sales"
        title={`${periodLabel(period)} sales review`}
        description="Tickets sold, sales, payouts, and net remittance with headers matched to the selected period."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Reports', href: '/reports' }, { label: 'Sales' }]}
        rightSlot={
          <Button variant="secondary" onClick={download} className="rounded-md border-slate-200 bg-white text-[#0B1220]">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          {periodTabs.map((tab) => {
            const active = period === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPeriod(tab.key)}
                className={
                  active
                    ? 'rounded-lg bg-navy-800 px-4 py-2 text-sm font-black text-white shadow-sm'
                    : 'rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-navy-50 hover:text-navy-700'
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <SectionCard title={`${periodLabel(period)} totals · ${total.toLocaleString('en-NG')} tickets · ${formatNaira(totalNgn)}`} padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={column.align === 'right' ? 'px-4 py-2 text-right' : 'px-4 py-2 text-left'}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.periodLabel}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === 'right' ? 'px-4 py-2 text-right font-bold tabular-nums' : 'px-4 py-2 font-mono text-xs font-black'}>
                      {formatCell(row[column.key], column.kind)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}

function periodLabel(period: ReportPeriod) {
  switch (period) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return 'Weekly';
    case 'MONTHLY':
      return 'Monthly';
    case 'YTD':
      return 'Year-to-date';
  }
}

type ReportRow = {
  periodLabel: string;
  tickets: number;
  grossSalesNgn: number;
  prizePayoutsNgn: number;
  netRemittanceNgn: number;
};

function buildReportRows(period: ReportPeriod, breakdown: ReturnType<typeof adminMock.getStateBreakdown>): ReportRow[] {
  const tickets = breakdown.reduce((sum, row) => sum + row.tickets, 0);
  const grossSalesNgn = breakdown.reduce((sum, row) => sum + row.salesNgn, 0);
  const prizePayoutsNgn = Math.round(grossSalesNgn * 0.18);
  const netRemittanceNgn = grossSalesNgn - prizePayoutsNgn;

  if (period === 'DAILY') {
    return breakdown.map((row) => ({
      periodLabel: row.state,
      tickets: row.tickets,
      grossSalesNgn: row.salesNgn,
      prizePayoutsNgn: Math.round(row.salesNgn * 0.18),
      netRemittanceNgn: row.salesNgn - Math.round(row.salesNgn * 0.18),
    }));
  }

  if (period === 'WEEKLY') {
    return [
      { periodLabel: 'Week 1', tickets: Math.round(tickets * 0.22), grossSalesNgn: Math.round(grossSalesNgn * 0.22), prizePayoutsNgn: Math.round(prizePayoutsNgn * 0.22), netRemittanceNgn: Math.round(netRemittanceNgn * 0.22) },
      { periodLabel: 'Week 2', tickets: Math.round(tickets * 0.24), grossSalesNgn: Math.round(grossSalesNgn * 0.24), prizePayoutsNgn: Math.round(prizePayoutsNgn * 0.24), netRemittanceNgn: Math.round(netRemittanceNgn * 0.24) },
      { periodLabel: 'Week 3', tickets: Math.round(tickets * 0.26), grossSalesNgn: Math.round(grossSalesNgn * 0.26), prizePayoutsNgn: Math.round(prizePayoutsNgn * 0.26), netRemittanceNgn: Math.round(netRemittanceNgn * 0.26) },
      { periodLabel: 'Week 4', tickets: Math.round(tickets * 0.28), grossSalesNgn: Math.round(grossSalesNgn * 0.28), prizePayoutsNgn: Math.round(prizePayoutsNgn * 0.28), netRemittanceNgn: Math.round(netRemittanceNgn * 0.28) },
    ];
  }

  if (period === 'MONTHLY') {
    return ['January', 'February', 'March', 'April'].map((month, index) => ({
      periodLabel: month,
      tickets: Math.round(tickets * (0.2 + index * 0.03)),
      grossSalesNgn: Math.round(grossSalesNgn * (0.2 + index * 0.03)),
      prizePayoutsNgn: Math.round(prizePayoutsNgn * (0.2 + index * 0.03)),
      netRemittanceNgn: Math.round(netRemittanceNgn * (0.2 + index * 0.03)),
    }));
  }

  return [{ periodLabel: `${new Date().getFullYear()} YTD`, tickets, grossSalesNgn, prizePayoutsNgn, netRemittanceNgn }];
}

function getColumns(period: ReportPeriod): Array<{ key: keyof ReportRow; label: string; csvKey: string; align?: 'right'; kind?: 'money' | 'number' }> {
  const firstLabel = period === 'DAILY' ? 'State' : period === 'WEEKLY' ? 'Week' : period === 'MONTHLY' ? 'Month' : 'YTD period';
  return [
    { key: 'periodLabel', label: firstLabel, csvKey: firstLabel.toLowerCase().replaceAll(' ', '_') },
    { key: 'tickets', label: period === 'YTD' ? 'Total tickets' : 'Tickets sold', csvKey: 'tickets_sold', align: 'right', kind: 'number' },
    { key: 'grossSalesNgn', label: period === 'DAILY' ? 'Sales' : 'Gross sales', csvKey: 'gross_sales_ngn', align: 'right', kind: 'money' },
    { key: 'prizePayoutsNgn', label: 'Prize payouts', csvKey: 'prize_payouts_ngn', align: 'right', kind: 'money' },
    { key: 'netRemittanceNgn', label: period === 'DAILY' ? 'Net due' : 'Net remittance', csvKey: 'net_remittance_ngn', align: 'right', kind: 'money' },
  ];
}

function formatCell(value: string | number, kind?: 'money' | 'number') {
  if (kind === 'money' && typeof value === 'number') return formatNaira(value);
  if (kind === 'number' && typeof value === 'number') return value.toLocaleString('en-NG');
  return value;
}
