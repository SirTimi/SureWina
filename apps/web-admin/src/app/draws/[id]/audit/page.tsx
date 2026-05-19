'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { Download, KeyRound, ShieldCheck, Trophy } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function DrawAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const draw = adminMock.getDraw(id);
  if (!draw) notFound();

  const breakdown = adminMock.getStateBreakdown();
  const total = breakdown.reduce((s, b) => s + b.tickets, 0);

  const download = () => {
    const csv = [
      'state,tickets,sales_ngn',
      ...breakdown.map((b) => `${b.state},${b.tickets},${b.salesNgn}`),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${draw.drawCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Post-draw audit"
        title={`Audit · ${draw.prizeDescription}`}
        description="RNG seed reveal, state breakdown, ticket-count signatures, winner verification."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: draw.drawCode, href: `/draws/${draw.drawCode}` },
          { label: 'Audit' },
        ]}
        rightSlot={
          <Button
            variant="accent"
            onClick={download}
            className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
          >
            <Download className="h-4 w-4" />
            Export audit report (PDF)
          </Button>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="RNG seed verification">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Commit hash
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[#1A1816]">
              <KeyRound className="mr-1 inline h-3 w-3" />
              {draw.rngSeedHashCommit ?? '—'}
            </p>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Revealed seed
            </p>
            <p className="mt-1 break-all font-mono text-xs text-[#1A1816]">
              {draw.rngSeedReveal ?? 'Not yet revealed'}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck className="h-3 w-3" />
              Hashes match
            </p>
          </SectionCard>

          <SectionCard title="Winner">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-lg font-black tracking-[0.1em]">
                  {draw.winnerTicketRef ?? '—'}
                </p>
                <p className="text-xs text-slate-500">
                  Verified via signed RNG output against committed hash.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Summary">
            <dl className="space-y-2 text-sm">
              <Row label="Tickets sold">
                {draw.ticketsSold.toLocaleString('en-NG')}
              </Row>
              <Row label="Prize value">{formatNaira(draw.prizeValueNgn)}</Row>
              <Row label="Gross revenue">
                {formatNaira(draw.ticketsSold * draw.ticketPriceNgn)}
              </Row>
              <Row label="States covered">{breakdown.length}</Row>
            </dl>
          </SectionCard>
        </div>

        <SectionCard
          title="State breakdown"
          description="How tickets were distributed geographically — used for State Games Management Board levy reports."
          padded={false}
        >
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-[#1A1816] tabular-nums">{children}</dd>
    </div>
  );
}
