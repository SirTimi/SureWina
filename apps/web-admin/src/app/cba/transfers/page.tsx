'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminCbaTransferRow, CbaTransferStatus } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const FILTERS: Array<{ label: string; value: CbaTransferStatus }> = [
  { label: 'Unclear outcome', value: 'UNCERTAIN' },
  { label: 'Stuck sending', value: 'SENDING' },
  { label: 'Refused', value: 'FAILED' },
  { label: 'Posted', value: 'POSTED' },
];

const TONE: Record<CbaTransferStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PENDING: 'info',
  SENDING: 'warning',
  POSTED: 'success',
  FAILED: 'neutral',
  UNCERTAIN: 'danger',
};

// Refused transfers finance may send again: money still owed to someone.
const RETRYABLE = new Set(['AGENT_COMMISSION', 'PRIZE_REIMBURSEMENT']);

export default function CbaTransfersPage() {
  return (
    <AdminShell>
      {(session) =>
        session.role === 'FINANCE_OFFICER' ? (
          <Body readOnly={session.tier === 'AUDITOR'} />
        ) : (
          <div className="mx-auto max-w-3xl p-8 text-sm text-slate-600">CBA transfer review is available to Finance officers only.</div>
        )
      }
    </AdminShell>
  );
}

function Body({ readOnly }: { readOnly: boolean }) {
  const [filter, setFilter] = useState<CbaTransferStatus>('UNCERTAIN');
  const [rows, setRows] = useState<AdminCbaTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.cba.adminTransfers(filter));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load transfers.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const retry = async (row: AdminCbaTransferRow) => {
    setBusy(row.transferId);
    setNotice(null);
    setError(null);
    try {
      const result = await api.cba.adminRetryTransfer(row.transferId);
      setNotice(result.status === 'POSTED' ? `${row.reference} posted.` : `${row.reference}: ${result.status}${result.failureReason ? ` — ${result.failureReason}` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The retry did not go through.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance · CBA wallets"
        title="CBA transfer review"
        description="Transfers the CBA never clearly answered. They are never sent again automatically. Check the CBA, then record what happened; the purchase, withdrawal or prize then finishes the safe way."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'CBA transfer review' }]}
        rightSlot={
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold ${filter === f.value ? 'bg-navy-800 text-white' : 'border border-slate-200 bg-white text-navy-700'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <SectionCard padded={false}>
          {loading && rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nothing here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.transferId} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={TONE[row.status]}>{row.status}</StatusPill>
                        <span className="text-sm font-bold text-navy-900">{row.purpose.replaceAll('_', ' ')}</span>
                        <span className="text-sm font-black tabular-nums text-navy-900">{formatNaira(row.amountNgn)}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{row.reference}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        CBA account {row.fromAccountId} → {row.toAccountId} · wallet {row.walletId.slice(0, 8)} · {new Date(row.createdAt).toLocaleString('en-NG')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{linked(row)}</p>
                      {row.failureReason && <p className="mt-1 text-xs text-red-700">{row.failureReason}</p>}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        {(row.status === 'UNCERTAIN' || row.status === 'SENDING') && (
                          <button type="button" onClick={() => setOpen(open === row.transferId ? null : row.transferId)} className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-bold text-white">
                            {open === row.transferId ? 'Close' : 'Record outcome'}
                          </button>
                        )}
                        {row.status === 'FAILED' && RETRYABLE.has(row.purpose) && (
                          <button type="button" onClick={() => void retry(row)} disabled={busy === row.transferId} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-navy-700 disabled:opacity-50">
                            {busy === row.transferId ? 'Sending…' : 'Send again'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {open === row.transferId && (
                    <ResolveForm
                      row={row}
                      onDone={async (message) => {
                        setOpen(null);
                        setNotice(message);
                        await load();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function linked(row: AdminCbaTransferRow) {
  if (row.walletPurchaseId) return `Wallet purchase ${row.walletPurchaseId}`;
  if (row.saleReference) return `Agent sale ${row.saleReference}`;
  if (row.prizeClaimId) return `Prize claim ${row.prizeClaimId}`;
  if (row.paymentTxnId) return `Payment ${row.paymentTxnId}`;
  return 'Not linked to a purchase or claim';
}

function ResolveForm({ row, onDone }: { row: AdminCbaTransferRow; onDone: (message: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState<'POSTED' | 'NOT_POSTED' | ''>('');
  const [cbaTransferId, setCbaTransferId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idNumber = Number(cbaTransferId);
  const idOk = outcome !== 'POSTED' || (Number.isSafeInteger(idNumber) && idNumber > 0);
  const noteOk = note.trim().length >= 10 && note.trim().length <= 500;
  const canSubmit = outcome !== '' && idOk && noteOk && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    const plain = outcome === 'POSTED' ? 'it reached the CBA' : 'it never reached the CBA';
    if (!window.confirm(`Record that ${row.reference} ${plain}? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.cba.adminResolveTransfer(row.transferId, {
        outcome,
        cbaTransferId: outcome === 'POSTED' ? idNumber : undefined,
        note: note.trim(),
      });
      await onDone(`${row.reference} recorded as ${outcome === 'POSTED' ? 'posted' : 'not posted'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the outcome.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        Search the CBA for <span className="font-mono">{row.reference}</span> on account {row.fromAccountId}. Record only what you can see there.
      </p>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={`outcome-${row.transferId}`} checked={outcome === 'POSTED'} onChange={() => setOutcome('POSTED')} />
          It is on the CBA
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`outcome-${row.transferId}`} checked={outcome === 'NOT_POSTED'} onChange={() => setOutcome('NOT_POSTED')} />
          It is not on the CBA
        </label>
      </fieldset>
      {outcome === 'POSTED' && (
        <label className="block text-sm">
          <span className="font-bold text-navy-900">CBA transfer ID</span>
          <input value={cbaTransferId} onChange={(e) => setCbaTransferId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 block w-48 rounded-md border border-slate-300 px-3 py-2" />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-bold text-navy-900">Note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="What you checked and where (at least 10 characters)" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="rounded-md bg-navy-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {saving ? 'Saving…' : 'Record outcome'}
      </button>
    </div>
  );
}
