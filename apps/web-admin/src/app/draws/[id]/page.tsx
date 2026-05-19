'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { Calendar, FileCheck2, KeyRound, Pencil, ShieldCheck, Trophy } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function DrawDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const tickets = adminMock.listTickets({ drawCode: draw.drawCode });
  const pct = Math.min(100, (draw.ticketsSold / draw.ticketCap) * 100);

  return (
    <>
      <PageHeader
        eyebrow="Draw"
        title={draw.prizeDescription}
        description={draw.drawCode}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: draw.drawCode },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link
              href={`/draws/${draw.drawCode}/pre-checks`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <FileCheck2 className="h-4 w-4" />
              Pre-checks
            </Link>
            <Link
              href={`/draws/${draw.drawCode}/audit`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Audit report
            </Link>
            <Link
              href={`/draws/${draw.drawCode}/edit`}
              className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-4 py-2 text-sm font-black text-white hover:bg-black"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Configuration">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <StatusPill tone={statusToTone(draw.status)}>{draw.status}</StatusPill>
              </Field>
              <Field label="Type">{draw.drawType.replace('_', ' ')}</Field>
              <Field label="Ticket price">{formatNaira(draw.ticketPriceNgn)}</Field>
              <Field label="Prize value">{formatNaira(draw.prizeValueNgn)}</Field>
              <Field label="Ticket cap">{draw.ticketCap.toLocaleString('en-NG')}</Field>
              <Field label="Created by">{draw.createdBy}</Field>
              <Field label="Cutoff">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {fmt(draw.cutoffAt)}
                </span>
              </Field>
              <Field label="Scheduled">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {fmt(draw.scheduledAt)}
                </span>
              </Field>
            </dl>
          </SectionCard>

          <SectionCard title="Sales progress">
            <p className="font-display text-3xl font-black tabular-nums">
              {draw.ticketsSold.toLocaleString('en-NG')}
              <span className="text-sm text-slate-400">
                {' / '}
                {draw.ticketCap.toLocaleString('en-NG')}
              </span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-navy-800"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{pct.toFixed(1)}% of cap</p>

            <hr className="my-4 border-slate-100" />

            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              RNG seed
            </p>
            <p className="mt-1 font-mono text-xs text-slate-700">
              <KeyRound className="mr-1 inline h-3 w-3" />
              {draw.rngSeedHashCommit ?? 'Not committed yet'}
            </p>
            {draw.rngSeedReveal && (
              <p className="mt-1 font-mono text-xs text-slate-700">
                Revealed: {draw.rngSeedReveal}
              </p>
            )}

            {draw.winnerTicketRef && (
              <>
                <hr className="my-4 border-slate-100" />
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                  Winner
                </p>
                <p className="mt-1 inline-flex items-center gap-2 font-mono text-sm font-black">
                  <Trophy className="h-4 w-4 text-navy-700" />
                  {draw.winnerTicketRef}
                </p>
              </>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Recent tickets"
          description="Sample of the most recent tickets purchased for this draw."
          padded={false}
          rightSlot={
            <Link
              href={`/tickets?drawCode=${draw.drawCode}`}
              className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
            >
              See all
            </Link>
          }
        >
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Ticket</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Channel</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.slice(0, 10).map((t) => (
                <tr key={t.ticketRef}>
                  <td className="px-4 py-2">
                    <Link
                      href={`/tickets/${t.ticketRef}`}
                      className="font-mono text-sm font-black text-[#0B1220] hover:text-navy-700"
                    >
                      {t.ticketRef}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{t.customerPhoneE164}</td>
                  <td className="px-4 py-2 text-xs">{t.channel}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNaira(t.amountNgn)}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill tone={statusToTone(t.status)}>{t.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold text-[#0B1220]">{children}</dd>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
