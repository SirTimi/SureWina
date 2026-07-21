'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AdminSeedRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

export default function RngSeedsPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [seeds, setSeeds] = useState<AdminSeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .seedRegistry()
      .then((res) => setSeeds(res.seeds))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load seed registry.'))
      .finally(() => setLoading(false));
  }, []);

  const mismatches = seeds.filter((s) => s.revealMatches === false);
  const sealed = seeds.filter((s) => !s.revealed).length;
  const verified = seeds.filter((s) => s.revealMatches === true).length;

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="RNG seed registry"
        description="Every seed commitment and its reveal. A revealed seed must hash to its pre-sales commitment — always."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'RNG seeds' }]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {mismatches.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-red-400 bg-red-50 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <p className="text-sm font-black text-red-700">
              {mismatches.length} reveal{mismatches.length === 1 ? '' : 's'} DO NOT match their
              commitment. This should be impossible — halt draws and investigate immediately.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Commitments" value={String(seeds.length)} />
              <Kpi label="Sealed (awaiting draw)" value={String(sealed)} />
              <Kpi label="Revealed & verified" value={String(verified)} accent />
            </div>

            <SectionCard title="Commitment chain" padded={false}>
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left">Draw</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Committed</th>
                    <th className="px-3 py-2 text-left">Commitment hash</th>
                    <th className="px-3 py-2 text-left">Reveal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {seeds.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        No seed commitments yet.
                      </td>
                    </tr>
                  ) : (
                    seeds.map((s) => (
                      <Fragment key={s.drawId}>
                        <tr
                          onClick={() => setOpenId(openId === s.drawId ? null : s.drawId)}
                          className="cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-3 py-2 text-slate-400">
                            {openId === s.drawId ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/draws/${s.drawId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-xs font-black text-navy-700 hover:underline"
                            >
                              {s.drawCode}
                            </Link>
                            <p className="text-[10px] text-slate-500">{s.drawType}</p>
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill tone={statusToTone(s.status)}>{s.status}</StatusPill>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {s.committedAt
                              ? new Date(s.committedAt).toLocaleString('en-NG', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[10px] text-slate-600">
                            {s.committedHash}
                          </td>
                          <td className="px-3 py-2">
                            {!s.revealed ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                <Lock className="h-3 w-3" />
                                Sealed
                              </span>
                            ) : s.revealMatches ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700">
                                <ShieldAlert className="h-3 w-3" />
                                MISMATCH
                              </span>
                            )}
                          </td>
                        </tr>
                        {openId === s.drawId && (
                          <tr className="bg-[#F8FAF4]">
                            <td />
                            <td colSpan={5} className="space-y-2 px-3 py-3">
                              <Mono label="Committed SHA-256 hash" value={s.committedHash} />
                              {s.revealed && (
                                <>
                                  <Mono label="Revealed seed" value={s.revealedSeed ?? ''} />
                                  {s.engineSignature && (
                                    <Mono label="Engine signature" value={s.engineSignature} />
                                  )}
                                  <p className="text-xs text-slate-500">
                                    Executed{' '}
                                    {s.executedAt
                                      ? new Date(s.executedAt).toLocaleString('en-NG')
                                      : '—'}
                                  </p>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                The engine commits a SHA-256 hash of each draw&apos;s seed before sales open and
                reveals the seed only at execution. &ldquo;Verified&rdquo; means the server has
                re-checked that the revealed seed hashes to its commitment. The same chain is
                independently checkable on the public verifier.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        accent
          ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-4'
          : 'rounded-xl border border-slate-200 bg-white p-4'
      }
    >
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p
        className={
          accent
            ? 'mt-1 font-display text-xl font-black text-emerald-700'
            : 'mt-1 font-display text-xl font-black text-[#0B1220]'
        }
      >
        {value}
      </p>
    </div>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 break-all rounded-md bg-white p-2 font-mono text-[10px] leading-relaxed text-slate-600">
        {value}
      </p>
    </div>
  );
}