'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { adminMock, type Claim, type ClaimStage } from '@/lib/admin-mock';

const STAGES: Array<{ stage: ClaimStage; title: string; tint: string }> = [
  { stage: 'NOTIFIED', title: 'Notified', tint: 'bg-sky-50 border-sky-200' },
  { stage: 'SELECTED', title: 'Path selected', tint: 'bg-violet-50 border-violet-200' },
  { stage: 'KYC', title: 'KYC', tint: 'bg-amber-50 border-amber-200' },
  { stage: 'DISPATCHED', title: 'Dispatched', tint: 'bg-indigo-50 border-indigo-200' },
  { stage: 'DELIVERED', title: 'Delivered', tint: 'bg-emerald-50 border-emerald-200' },
  { stage: 'FORFEITED', title: 'Forfeited', tint: 'bg-red-50 border-red-200' },
];

export default function ClaimsKanbanPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const all = adminMock.listClaims();

  return (
    <>
      <PageHeader
        eyebrow="Claims pipeline"
        title="Winner claims"
        description="Every winning ticket moves through these stages. Sticky claims need a contact attempt."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Claims' }]}
      />

      <div className="mx-auto max-w-[1600px] px-6 py-5">
        <div className="thin-scrollbar grid auto-cols-[300px] grid-flow-col gap-3 overflow-x-auto pb-3">
          {STAGES.map((col) => {
            const items = all.filter((c) => c.stage === col.stage);
            return (
              <section
                key={col.stage}
                className={`rounded-xl border ${col.tint} flex h-[640px] flex-col`}
              >
                <header className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                    {col.title}
                  </p>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600">
                    {items.length}
                  </span>
                </header>
                <div className="thin-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-slate-400">
                      Empty
                    </p>
                  ) : (
                    items.map((c) => <KanbanCard key={c.claimId} claim={c} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KanbanCard({ claim }: { claim: Claim }) {
  const daysToForfeit = Math.ceil(
    (new Date(claim.forfeitsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );

  return (
    <Link
      href={`/claims/${claim.claimId}`}
      className="block rounded-md border border-black/5 bg-white p-3 shadow-sm transition hover:border-navy-200 hover:shadow-md"
    >
      <p className="font-mono text-xs font-black text-[#0B1220]">{claim.ticketRef}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#0B1220]">
        {claim.prizeDescription}
      </p>
      <p className="text-xs font-bold tabular-nums text-navy-700">
        {formatNaira(claim.prizeValueNgn)}
      </p>
      <p className="mt-1 font-mono text-[10px] text-slate-500">
        {claim.winnerPhoneE164}
      </p>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="inline-flex items-center gap-1 text-slate-500">
          <Clock className="h-3 w-3" />
          {daysToForfeit}d to forfeit
        </span>
        {claim.contactAttempts > 1 && (
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-black uppercase tracking-[0.14em] text-amber-700">
            {claim.contactAttempts}× contacted
          </span>
        )}
      </div>
    </Link>
  );
}
