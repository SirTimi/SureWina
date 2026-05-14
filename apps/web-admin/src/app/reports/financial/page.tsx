'use client';

import { useState } from 'react';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function FinancialReportsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const pnl = adminMock.getFinancialPnl(period);

  const download = () => {
    const lines = [
      `metric,value_ngn,period`,
      `revenue,${pnl.revenueNgn},${period}`,
      `prizes,${pnl.prizesNgn},${period}`,
      `commission,${pnl.commissionNgn},${period}`,
      `net,${pnl.netNgn},${period}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-pnl-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Financial"
        title="Profit & loss"
        description="High-level P&L across daily, weekly, and monthly cycles. Investor packs source these numbers."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Financial' },
        ]}
        rightSlot={
          <Button
            variant="secondary"
            onClick={download}
            className="rounded-md border-slate-200 bg-white text-[#0B1220]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <div className="flex items-center gap-1.5">
          {(['daily', 'weekly', 'monthly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={
                period === p
                  ? 'rounded-md bg-[#0B1220] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white'
                  : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 hover:bg-slate-50'
              }
            >
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={TrendingUp} label="Revenue" value={formatNaira(pnl.revenueNgn)} tone="success" />
          <KpiTile icon={TrendingDown} label="Prizes" value={formatNaira(pnl.prizesNgn)} tone="warning" />
          <KpiTile icon={TrendingDown} label="Commission" value={formatNaira(pnl.commissionNgn)} tone="warning" />
          <KpiTile
            icon={pnl.netNgn >= 0 ? TrendingUp : TrendingDown}
            label="Net P&L"
            value={formatNaira(pnl.netNgn)}
            tone={pnl.netNgn >= 0 ? 'success' : 'danger'}
          />
        </div>

        <SectionCard title="Breakdown" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Line item</th>
                <th className="px-4 py-2 text-right">Amount (₦)</th>
                <th className="px-4 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <Row label="Ticket revenue" value={pnl.revenueNgn} share={1} positive />
              <Row label="Prize payouts" value={-pnl.prizesNgn} share={pnl.prizesNgn / pnl.revenueNgn} />
              <Row
                label="Agent commission"
                value={-pnl.commissionNgn}
                share={pnl.commissionNgn / pnl.revenueNgn}
              />
              <Row label="Net" value={pnl.netNgn} share={pnl.netNgn / pnl.revenueNgn} bold positive />
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  share,
  positive = false,
  bold = false,
}: {
  label: string;
  value: number;
  share: number;
  positive?: boolean;
  bold?: boolean;
}) {
  return (
    <tr className={bold ? 'bg-[#F8FAF4] font-black' : ''}>
      <td className="px-4 py-2">{label}</td>
      <td
        className={
          'px-4 py-2 text-right tabular-nums ' +
          (value < 0
            ? 'text-red-700'
            : positive
              ? 'text-emerald-700'
              : 'text-[#0B1220]')
        }
      >
        {value < 0
          ? `-${formatNaira(Math.abs(value))}`
          : formatNaira(value)}
      </td>
      <td className="px-4 py-2 text-right text-xs text-slate-500">
        {(share * 100).toFixed(1)}%
      </td>
    </tr>
  );
}
