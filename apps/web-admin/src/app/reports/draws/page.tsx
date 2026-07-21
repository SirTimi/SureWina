'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Printer, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawDetail, AdminDrawRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function DrawAuditPacksPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [draws, setDraws] = useState<AdminDrawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pack, setPack] = useState<AdminDrawDetail | null>(null);
  const [packLoading, setPackLoading] = useState(false);

  useEffect(() => {
    api.admin
      .listDraws('COMPLETED')
      .then((res) => setDraws(res.draws))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load draws.'))
      .finally(() => setLoading(false));
  }, []);

  const openPack = (drawId: string) => {
    setSelectedId(drawId);
    setPack(null);
    setPackLoading(true);
    api.admin
      .drawDetail(drawId)
      .then(setPack)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load audit pack.'))
      .finally(() => setPackLoading(false));
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <PageHeader
        eyebrow="Reports"
        title="Draw audit packs"
        description="Per-draw evidence: committed seed, revealed seed, Merkle root, and the signed result. Print any pack to PDF."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Draw packs' },
        ]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="no-print">
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-white" />
          ) : (
            <SectionCard title="Completed draws" padded={false}>
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Draw</th>
                    <th className="px-4 py-2 text-right">Prize</th>
                    <th className="px-4 py-2 text-right">Sold</th>
                    <th className="px-4 py-2 text-left">Executed</th>
                    <th className="px-4 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draws.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No completed draws yet.
                      </td>
                    </tr>
                  ) : (
                    draws.map((d) => (
                      <tr key={d.drawId} className={selectedId === d.drawId ? 'bg-navy-50' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#0B1220]">{d.prizeDescription}</p>
                          <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNaira(d.prizeValueNgn)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {d.ticketsSold.toLocaleString('en-NG')}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(d.scheduledAt).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openPack(d.drawId)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-navy-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-navy-700 hover:bg-navy-100"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {selectedId === d.drawId ? 'Reload pack' : 'Open pack'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>
          )}
        </div>

        {packLoading && <div className="h-64 animate-pulse rounded-xl bg-white" />}

        {pack && (
          <div className="rounded-xl border-2 border-slate-300 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Surewina · Draw audit pack
                </p>
                <p className="mt-1 font-display text-2xl font-black text-[#0B1220]">
                  {pack.draw.drawCode}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {pack.draw.prizeDescription} · {formatNaira(pack.draw.prizeValueNgn)} ·{' '}
                  {pack.draw.drawType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-3 py-2 text-sm font-black text-white"
              >
                <Printer className="h-4 w-4" />
                Print pack
              </button>
            </div>

            <div className="space-y-5 p-5">
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  1 · Draw parameters
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
                  <Fact label="Status">
                    <StatusPill tone={statusToTone(pack.draw.status)}>{pack.draw.status}</StatusPill>
                  </Fact>
                  <Fact label="Ticket price">{formatNaira(pack.draw.ticketPriceNgn)}</Fact>
                  <Fact label="Quota">
                    {pack.draw.ticketQuota ? pack.draw.ticketQuota.toLocaleString('en-NG') : 'Unlimited'}
                  </Fact>
                  <Fact label="Sales cutoff">
                    {new Date(pack.draw.cutoffAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
                    })}
                  </Fact>
                  <Fact label="Scheduled">
                    {new Date(pack.draw.scheduledAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
                    })}
                  </Fact>
                  <Fact label="Created">
                    {new Date(pack.draw.createdAt).toLocaleDateString('en-NG', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </Fact>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  2 · Sales
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
                  <Fact label="Tickets sold">{pack.sales.ticketsSold.toLocaleString('en-NG')}</Fact>
                  <Fact label="Gross sales">{formatNaira(pack.sales.grossSalesNgn)}</Fact>
                  <Fact label="Agent tickets">{pack.sales.agentTickets.toLocaleString('en-NG')}</Fact>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  3 · Seed commitment (pre-sales)
                </h3>
                {pack.seed ? (
                  <div className="mt-2 space-y-2">
                    <Mono label="Committed SHA-256 hash" value={pack.seed.seedHash} />
                    <p className="text-xs text-slate-500">
                      Committed{' '}
                      {pack.seed.committedAt
                        ? new Date(pack.seed.committedAt).toLocaleString('en-NG')
                        : '—'}{' '}
                      · {pack.seed.revealed ? 'seed revealed at execution' : 'not yet revealed'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No seed commitment on record.</p>
                )}
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  4 · Signed result
                </h3>
                {pack.result ? (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Winning ticket
                        </p>
                        <p className="font-mono text-2xl font-black text-[#0B1220]">
                          {pack.result.winnerTicketRef}
                        </p>
                      </div>
                      <span
                        className={
                          pack.result.zeroInterventionConfirmed
                            ? 'inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700'
                            : 'inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700'
                        }
                      >
                        {pack.result.zeroInterventionConfirmed ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        Zero intervention
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
                      <Fact label="Executed">
                        {new Date(pack.result.executedAt).toLocaleString('en-NG')}
                      </Fact>
                      <Fact label="Engine version">{pack.result.engineVersion}</Fact>
                      <Fact label="Eligible participants">
                        {pack.result.totalEligibleParticipants.toLocaleString('en-NG')}
                      </Fact>
                      <Fact label="Tickets in pool">
                        {pack.result.totalTicketsSold.toLocaleString('en-NG')}
                      </Fact>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Mono label="Revealed seed" value={pack.result.rngSeed} />
                      <Mono label="Seed hash (matches §3)" value={pack.result.rngSeedHash} />
                      <Mono label="Merkle root (ticket pool)" value={pack.result.merkleRoot} />
                      <Mono label="Ed25519 engine signature" value={pack.result.engineSignature} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Draw completed without a result record — investigate.
                  </p>
                )}
              </section>

              <div className="flex items-start gap-2 border-t border-slate-200 pt-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
                <p className="text-xs leading-relaxed text-slate-600">
                  Verification: hash the revealed seed (SHA-256) and compare with the committed hash
                  in §3; recompute the winner from seed + Merkle root using the published engine
                  algorithm; verify the Ed25519 signature against Surewina&apos;s public engine key.
                  All artefacts are also available on the public verifier.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#0B1220]">{children}</p>
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