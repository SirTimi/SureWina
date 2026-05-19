'use client';

import { Download } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

const LEVY_RATE = 0.025;

export default function StateLevyReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const breakdown = adminMock.getStateBreakdown();

  const download = () => {
    const csv = [
      'state,sales_ngn,levy_rate,levy_due_ngn',
      ...breakdown.map(
        (b) =>
          `${b.state},${b.salesNgn},${LEVY_RATE},${Math.round(b.salesNgn * LEVY_RATE)}`,
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `state-levy-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Compliance"
        title="State Games Management Board levy"
        description="2.5% of sales is remitted to the State Games Management Board for each state of play."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'State levy' },
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

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <SectionCard padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">State</th>
                <th className="px-4 py-2 text-right">Sales (₦)</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Levy due (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breakdown.map((b) => {
                const levy = Math.round(b.salesNgn * LEVY_RATE);
                return (
                  <tr key={b.state}>
                    <td className="px-4 py-2 font-mono text-xs font-black">{b.state}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNaira(b.salesNgn)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-slate-500">
                      {(LEVY_RATE * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-navy-700">
                      {formatNaira(levy)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#F8FAF4] font-black">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatNaira(breakdown.reduce((s, b) => s + b.salesNgn, 0))}
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">—</td>
                <td className="px-4 py-2 text-right tabular-nums text-navy-700">
                  {formatNaira(
                    Math.round(
                      breakdown.reduce((s, b) => s + b.salesNgn, 0) * LEVY_RATE,
                    ),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
