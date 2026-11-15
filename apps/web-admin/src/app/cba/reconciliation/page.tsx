'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import type { CbaReconciliationRunView, CbaReconciliationStatus } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const TONE: Record<CbaReconciliationStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PASS: 'success',
  SHORTFALL: 'danger',
  MISMATCH: 'warning',
  INCOMPLETE: 'neutral',
};

export default function CbaReconciliationPage() {
  return (
    <AdminShell>
      {(session) =>
        session.role === 'FINANCE_OFFICER' ? (
          <Body readOnly={session.tier === 'AUDITOR'} />
        ) : (
          <div className="mx-auto max-w-3xl p-8 text-sm text-slate-600">Vault reconciliation is available to Finance officers only.</div>
        )
      }
    </AdminShell>
  );
}

function Body({ readOnly }: { readOnly: boolean }) {
  const [runs, setRuns] = useState<CbaReconciliationRunView[]>([]);
  const [selected, setSelected] = useState<CbaReconciliationRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.cba.adminReconciliationRuns(30);
      setRuns(list);
      setSelected((current) => list.find((r) => r.runId === current?.runId) ?? list[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reconciliation runs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const run = await api.cba.adminRunReconciliation();
      setSelected(run);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reconciliation did not run.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance · CBA wallets"
        title="Vault reconciliation"
        description="The Monnify wallet (vault) against every CBA account (book). The test is coverage: the vault must hold everything owed to customers and agents. Nothing here is corrected automatically."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Vault reconciliation' }]}
        rightSlot={
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 disabled:opacity-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            {!readOnly && (
              <button type="button" onClick={() => void runNow()} disabled={running} className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <Play className="h-4 w-4" /> {running ? 'Running…' : 'Run now'}
              </button>
            )}
          </div>
        }
      />
      <div className="mx-auto grid max-w-[1400px] gap-5 px-6 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <SectionCard title="Runs" padded={false}>
          {error ? (
            <p role="alert" className="p-5 text-sm text-red-700">{error}</p>
          ) : loading && runs.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No runs yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {runs.map((run) => (
                <li key={run.runId}>
                  <button
                    type="button"
                    onClick={() => setSelected(run)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${selected?.runId === run.runId ? 'bg-navy-50' : 'hover:bg-slate-50'}`}
                  >
                    <div>
                      <p className="text-sm font-bold text-navy-900">{run.businessDate}</p>
                      <p className="text-xs text-slate-500">{when(run.completedAt)} · {run.triggeredBy === 'schedule' ? 'scheduled' : 'manual'}</p>
                    </div>
                    <StatusPill tone={TONE[run.status]}>{run.status}</StatusPill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {selected && <RunDetail run={selected} />}
      </div>
    </>
  );
}

function RunDetail({ run }: { run: CbaReconciliationRunView }) {
  return (
    <div className="space-y-5">
      <SectionCard title={`Run ${run.businessDate}`} rightSlot={<StatusPill tone={TONE[run.status]}>{run.status}</StatusPill>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Vault (Monnify)" value={run.vaultNgn} />
          <Figure label="Owed to customers & agents" value={run.obligationsNgn} />
          <Figure label="Coverage" value={run.coverageNgn} emphasis={run.coverageNgn < 0 ? 'bad' : 'good'} />
        </div>

        <table className="mt-5 w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <Row label="Customer and agent accounts" value={run.ownersNgn} />
            <Row label="Pending Withdrawals (book)" value={run.pendingWithdrawalsNgn} />
            <Row label="Pending Withdrawals (expected)" value={run.expectedPendingWithdrawalsNgn} />
            <Row label="Top-ups received, not credited" value={run.uncreditedTopUpsNgn} />
            <Row label="Withdrawals paid, not settled" value={run.paidUnsettledWithdrawalsNgn} />
            <Row label="SureWina sales account" value={run.salesNgn} />
            <Row label="Unexplained vault difference" value={run.unexplainedNgn} hint="Monnify fees, prize bank payouts, SureWina's own transfers" />
          </tbody>
        </table>

        <p className="mt-4 text-xs text-slate-500">
          {run.accountsRead} CBA account(s) read{run.accountsFailed > 0 ? `, ${run.accountsFailed} could not be read` : ''}.
        </p>
      </SectionCard>

      <SectionCard title="Issues" description="Each one is for finance to work through. Nothing is corrected automatically.">
        {run.issues.length === 0 ? (
          <p className="text-sm text-slate-500">No issues.</p>
        ) : (
          <ul className="space-y-3">
            {run.issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`} className={`rounded-md border p-3 text-sm ${issue.severity === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <p className="font-bold">{issue.code.replaceAll('_', ' ')}</p>
                <p className="mt-1">{issue.message}</p>
                {issue.detail && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-white/60 p-2 text-[11px] text-slate-700">{JSON.stringify(issue.detail, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Figure({ label, value, emphasis }: { label: string; value: number; emphasis?: 'good' | 'bad' }) {
  return (
    <div className={`rounded-md border p-3 ${emphasis === 'bad' ? 'border-red-200 bg-red-50' : emphasis === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-navy-900">{naira(value)}</p>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-slate-600">
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </td>
      <td className="py-2 text-right font-bold tabular-nums text-navy-900">{naira(value)}</td>
    </tr>
  );
}

// Kobo matter here: the vault and the CBA both carry them.
function naira(value: number) {
  return value.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
