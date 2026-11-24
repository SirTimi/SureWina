'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Lock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDrawApprovals, AdminDrawRelease } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api';

// Phase 2: the approval before every draw. After sales close the system
// reconciles the draw; an approver reviews the result and approves with
// their password and two-factor code. The engine runs only approved draws.

export default function DrawApprovalsPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [data, setData] = useState<AdminDrawApprovals | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api.admin
      .drawApprovals()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(message(e)));

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  const approveSetup = async (drawId: string, code: string) => {
    setNotice(null);
    setError(null);
    try {
      await api.admin.approveDrawSetup(drawId);
      setNotice(`${code}: setup approved. Sales open at the set time.`);
      void load();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="Approvals"
        description="Every draw is checked when sales close and runs only after it is approved. Approving confirms the figures; it cannot change who wins — the random seed was sealed before sales opened."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Draws', href: '/draws' }, { label: 'Approvals' }]}
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        {data && (
          <p className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
            {data.approvalRequired ? 'Approval required before every draw.' : 'Approval is automatic when every check passes.'} Approvers:{' '}
            {data.approvers.tiers.join(', ')}
            {data.approvers.roles.length ? ` (${data.approvers.roles.join(', ')})` : ''}. Escalated if not approved {data.escalateMinutes} minutes after sales close.
          </p>
        )}
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

        <SectionCard title="Closed draws" description="Sales have closed. Each runs once approved.">
          {!data ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
          ) : data.closedDraws.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nothing waiting. Draws appear here when their sales close.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Draw</th>
                    <th className="py-2 pr-3">Draw time</th>
                    <th className="py-2 pr-3">Tickets</th>
                    <th className="py-2 pr-3">Sales</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.closedDraws.map((d) => (
                    <tr key={d.drawId} className={`border-t border-slate-100 ${selected === d.drawId ? 'bg-navy-50' : ''}`}>
                      <td className="py-2 pr-3">
                        <span className="font-bold">{d.productName ?? d.drawCode}</span>
                        <span className="block font-mono text-[10px] text-slate-400">{d.drawCode}</span>
                      </td>
                      <td className="py-2 pr-3">{dateTime(d.scheduledAt)}</td>
                      <td className="py-2 pr-3 font-mono">{d.tickets?.toLocaleString('en-NG') ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono">{d.salesNgn != null ? formatNaira(d.salesNgn) : '—'}</td>
                      <td className="py-2 pr-3">
                        <StatusPill status={d.releaseStatus} />
                        {d.escalated && <span className="ml-1 text-[10px] font-black uppercase text-red-600">escalated</span>}
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => setSelected(d.drawId)} className={smallButton}>
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {selected && (
          <ReleasePanel
            key={selected}
            drawId={selected}
            onChanged={(text) => {
              setNotice(text);
              void load();
            }}
          />
        )}

        <SectionCard title="Draw setups awaiting approval" description="Draws set up by hand (product draws are approved through their product). Sales cannot open until a different senior admin approves.">
          {!data || data.setups.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">None.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.setups.map((d) => (
                <li key={d.drawId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono text-xs font-bold">{d.drawCode}</span> · {d.prizeDescription} · {formatNaira(d.ticketPriceNgn)} ticket · draw {dateTime(d.scheduledAt)}
                  </span>
                  <span className="flex gap-2">
                    <a href={`/draws/${d.drawId}`} className={smallButton}>Open</a>
                    <button type="button" onClick={() => approveSetup(d.drawId, d.drawCode)} className={approveButton}>Approve setup</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function ReleasePanel({ drawId, onChanged }: { drawId: string; onChanged: (notice: string) => void }) {
  const [r, setR] = useState<AdminDrawRelease | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.admin.drawRelease(drawId).then(setR).catch((e) => setError(message(e)));
  useEffect(() => {
    void load();
  }, [drawId]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPassword('');
      setCode('');
      setReason('');
      await load();
      onChanged(done);
    } catch (e) {
      setError(message(e));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const blob = await api.admin.drawReleaseReport(drawId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r?.drawCode ?? drawId}-tickets.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    }
  };

  if (!r) return <SectionCard title="Loading…"><div className="h-24 animate-pulse rounded-lg bg-slate-50" /></SectionCard>;
  const rel = r.release;
  const canDecide = rel?.status === 'AWAITING_APPROVAL';
  const canReject = rel?.status === 'AWAITING_APPROVAL' || rel?.status === 'CHECKS_FAILED';

  return (
    <SectionCard
      title={`${r.productName ?? 'Draw'} · ${r.drawCode}`}
      description={`Sales closed ${dateTime(r.cutoffAt)} · draw time ${dateTime(r.scheduledAt)}`}
      rightSlot={
        <div className="flex gap-2">
          <button type="button" onClick={download} className={smallButton}>
            <Download className="h-3.5 w-3.5" /> Every ticket (CSV)
          </button>
          <button type="button" disabled={busy} onClick={() => act(() => api.admin.recheckDrawRelease(drawId), `${r.drawCode}: checked again.`)} className={smallButton}>
            <RefreshCw className="h-3.5 w-3.5" /> Check again
          </button>
        </div>
      }
    >
      {!rel ? (
        <p className="text-sm text-slate-500">The checks run within 30 seconds of sales closing.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Status"><StatusPill status={rel.status} /></Figure>
            <Figure label="Tickets">{rel.tickets.toLocaleString('en-NG')}{rel.entries ? ` + ${rel.entries} free` : ''}</Figure>
            <Figure label="Sales (gross)">{formatNaira(rel.salesNgn)}</Figure>
            <Figure label="Checked">{dateTime(rel.checkedAt)}{rel.checkRuns > 1 ? ` (run ${rel.checkRuns})` : ''}</Figure>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Checks</p>
            <ul className="space-y-1.5">
              {rel.checks.map((c) => (
                <li key={c.code} className="flex gap-2 text-sm">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : c.blocking ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <span>
                    <span className="font-bold">{c.label}</span>
                    {!c.ok && c.blocking && <span className="ml-1 text-[10px] font-black uppercase text-red-600">blocks approval</span>}
                    <span className="block text-xs text-slate-500">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {r.plan && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                What it pays {r.plan.model === 'POOL' ? `(estimate at gross sales; pool ${formatNaira(r.plan.poolNgn ?? 0)})` : ''}
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {r.plan.tiers.map((t) => (
                    <tr key={t.tierNo} className="border-t border-slate-100">
                      <td className="py-1.5 pr-3 font-bold">{t.name}</td>
                      <td className="py-1.5 pr-3 font-mono">{t.winners.toLocaleString('en-NG')} winners</td>
                      <td className="py-1.5 pr-3">{t.prizeDescription}</td>
                      <td className="py-1.5 text-right font-mono">{formatNaira(t.winners * t.prizePerWinnerNgn)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-black">
                    <td className="py-1.5 pr-3">Total</td>
                    <td className="py-1.5 pr-3 font-mono">{r.plan.totalWinners.toLocaleString('en-NG')}</td>
                    <td />
                    <td className="py-1.5 text-right font-mono">{formatNaira(r.plan.totalPrizeNgn)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="flex items-center gap-1.5 break-all font-mono text-[10px] text-slate-400">
            <Lock className="h-3 w-3 shrink-0" /> Fingerprint {rel.snapshotHash}
          </p>

          {rel.status === 'APPROVED' && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Approved {rel.approvedAt ? dateTime(rel.approvedAt) : ''}. The engine runs it at the draw time (or now, if that has passed).
            </p>
          )}
          {rel.status === 'REJECTED' && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Rejected {rel.rejectedAt ? dateTime(rel.rejectedAt) : ''}: {rel.rejectionReason}. Investigate, then check again, or cancel the draw (tickets are refunded).
            </p>
          )}
          {rel.status === 'INVALIDATED' && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              The draw changed after it was approved, so the engine refused to run it. Check it again and review before approving.
            </p>
          )}

          {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {canDecide && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api.admin.approveDrawRelease(drawId, password, code.trim()), `${r.drawCode}: approved.`);
              }}
              className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
            >
              <p className="mb-3 flex items-center gap-2 text-sm font-black text-[#0B1220]">
                <ShieldCheck className="h-4 w-4 text-emerald-700" /> Approve this draw
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
                <input type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
                <input inputMode="numeric" autoComplete="one-time-code" placeholder="Two-factor code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
                <button type="submit" disabled={busy || !password || code.trim().length < 6} className={approveButtonLarge}>
                  Approve
                </button>
              </div>
            </form>
          )}

          {canReject && (
            <div className="flex flex-wrap items-center gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, to reject (at least 10 characters)" className={`${input} flex-1`} />
              <button
                type="button"
                disabled={busy || reason.trim().length < 10}
                onClick={() => act(() => api.admin.rejectDrawRelease(drawId, reason.trim()), `${r.drawCode}: rejected. The draw is held.`)}
                className={rejectButton}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    CHECKING: ['Checking', 'bg-slate-100 text-slate-600'],
    CHECKS_FAILED: ['Check failed', 'bg-red-50 text-red-700'],
    AWAITING_APPROVAL: ['Awaiting approval', 'bg-amber-50 text-amber-800'],
    APPROVED: ['Approved', 'bg-emerald-50 text-emerald-700'],
    REJECTED: ['Rejected', 'bg-red-50 text-red-700'],
    INVALIDATED: ['Changed after approval', 'bg-red-50 text-red-700'],
  };
  const [text, cls] = map[status] ?? [status, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{text}</span>;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-bold text-[#0B1220]">{children}</div>
    </div>
  );
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'That did not work.';
}

const input = 'h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700';
const smallButton = 'inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#0B1220] hover:border-slate-300 disabled:opacity-40';
const approveButton = 'rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-black text-white';
const approveButtonLarge = 'h-10 rounded-md bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-40';
const rejectButton = 'h-10 rounded-md border border-red-200 bg-white px-4 text-sm font-black text-red-700 disabled:opacity-40';
