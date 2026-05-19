'use client';

import { Download } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function SalesReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const breakdown = adminMock.getStateBreakdown();
  const total = breakdown.reduce((s, b) => s + b.tickets, 0);
  const totalNgn = breakdown.reduce((s, b) => s + b.salesNgn, 0);

  const download = () => {
    const csv = [
      'state,tickets,sales_ngn',
      ...breakdown.map((b) => `${b.state},${b.tickets},${b.salesNgn}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-by-state-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Sales"
        title="Daily sales by state"
        description="Tickets sold and revenue, segmented by registered state of play. Used for State Games Management Board levy calculation."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Sales' },
        ]}
        rightSlot={
          <Button
            variant="secondary"
            onClick={download}
            className="rounded-md border-slate-200 bg-white text-[#1A1816]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <SectionCard title={`Totals · ${total} tickets · ${formatNaira(totalNgn)}`} padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">State</th>
                <th className="px-4 py-2 text-right">Tickets</th>
                <th className="px-4 py-2 text-right">Share</th>
                <th className="px-4 py-2 text-right">Sales (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breakdown.map((b) => {
                const pct = total > 0 ? (b.tickets / total) * 100 : 0;
                return (
                  <tr key={b.state}>
                    <td className="px-4 py-2 font-mono text-xs font-black">{b.state}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {b.tickets.toLocaleString('en-NG')}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex w-full max-w-[160px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-navy-800"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">
                      {formatNaira(b.salesNgn)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
