'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Hash,
  Pencil,
  ShieldCheck,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

export default function DrawDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {(session) => <Body id={id} session={session} />}
    </AdminShell>
  );
}

function Body({ id, session }: { id: string; session: AdminSession }) {
  const [data, setData] = useState<AdminDrawDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.admin
      .drawDetail(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load draw.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const cancel = async () => {
    if (!data) return;
    if (!window.confirm(`Cancel ${data.draw.drawCode}? Sold tickets must be refunded separately.`)) return;
    setBusy(true);
    try {
      await api.admin.cancelDraw(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-bold text-red-700">{error ?? 'Draw not found.'}</p>
          <Link href="/draws" className="mt-3 inline-block text-sm font-black text-navy-700 hover:underline">
            Back to draws
          </Link>
        </div>
      </div>
    );
  }

  const { draw, sales, seed, result } = data;
  const editable = draw.status === 'SCHEDULED';
  const cancellable = draw.status === 'SCHEDULED' || draw.status === 'ACTIVE';

  return (
    <>
      <PageHeader
        eyebrow={draw.drawType === 'SATURDAY_JACKPOT' ? 'Jackpot draw' : 'Daily draw'}
        title={draw.prizeDescription}
        description={draw.drawCode}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: draw.drawCode },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(draw.status)}>{draw.status}</StatusPill>

            {editable && (
              <Link
                href={`/draws/${id}/edit`}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            )}

            {cancellable && (
              <GuardedActionButton
                session={session}
                action="APPROVE_DRAW_SETUP"
                icon={<Ban className="h-4 w-4" />}
                onClick={cancel}
                className="rounded-md border-red-200 bg-red-50 text-red-700"
              >
                {busy ? 'Working…' : 'Cancel draw'}
              </GuardedActionButton>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Trophy} label="Prize value">{formatNaira(draw.prizeValueNgn)}</Stat>
          <Stat icon={Ticket} label="Tickets sold">
            {sales.ticketsSold.toLocaleString('en-NG')}
            {draw.ticketQuota ? ` / ${draw.ticketQuota.toLocaleString('en-NG')}` : ''}
          </Stat>
          <Stat icon={Users} label="Gross sales">{formatNaira(sales.grossSalesNgn)}</Stat>
          <Stat icon={Ticket} label="Ticket price">{formatNaira(draw.ticketPriceNgn)}</Stat>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <SectionCard title="Timing">
            <Row label="Sales cutoff">
              {new Date(draw.cutoffAt).toLocaleString('en-NG', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </Row>
            <Row label="Draw runs at">
              {new Date(draw.scheduledAt).toLocaleString('en-NG', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </Row>
            <Row label="Created">
              {new Date(draw.createdAt).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Row>
            <Row label="Agent tickets">{sales.agentTickets.toLocaleString('en-NG')}</Row>
          </SectionCard>

          <SectionCard title="RNG seed">
            {seed ? (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Committed hash
                </p>
                <p className="mt-1 break-all rounded-md bg-[#F8FAF4] p-3 font-mono text-xs text-slate-700">
                  {seed.seedHash}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {seed.committedAt
                    ? `Committed ${new Date(seed.committedAt).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'Committed'}
                  {seed.revealed ? ' · revealed' : ' · sealed until draw'}
                </p>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-slate-500">
                Seed not yet committed. The engine commits before sales open.
              </p>
            )}
          </SectionCard>
        </div>

        {result && (
          <SectionCard
            title="Draw result"
            description="Signed by the engine. Verifiable against the committed seed hash."
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Winning ticket
                </p>
                <p className="mt-1 font-mono text-2xl font-black text-[#0B1220]">
                  {result.winnerTicketRef}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Executed{' '}
                  {new Date(result.executedAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · engine {result.engineVersion}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip ok={result.zeroInterventionConfirmed} label="Zero intervention" />
                  <Chip
                    ok
                    label={`${result.totalEligibleParticipants.toLocaleString('en-NG')} eligible`}
                  />
                  <Chip ok label={`${result.totalTicketsSold.toLocaleString('en-NG')} sold`} />
                </div>
              </div>

              <div className="space-y-2">
                <Mono label="Revealed seed" value={result.rngSeed} />
                <Mono label="Seed hash" value={result.rngSeedHash} />
                <Mono label="Merkle root" value={result.merkleRoot} />
                <Mono label="Engine signature" value={result.engineSignature} />
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Trophy;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-lg font-black text-[#0B1220]">{children}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 break-all rounded-md bg-[#F8FAF4] p-2 font-mono text-[10px] leading-relaxed text-slate-600">
        {value}
      </p>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700'
          : 'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700'
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {label}
    </span>
  );
}