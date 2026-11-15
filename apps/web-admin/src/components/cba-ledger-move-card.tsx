'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatNaira } from '@surewina/utils';
import type { CbaAccountPurpose, CbaLedgerBalancePreview } from '@surewina/api-client';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const PURPOSE_LABEL: Record<CbaAccountPurpose, string> = {
  DEPOSIT: 'Deposit account',
  WINNINGS: 'Winnings account',
  FLOAT: 'Float account',
  EARNINGS: 'Earnings account',
};

// Moves a wallet's remaining SureWina-ledger balance onto its CBA account,
// once. Finance picks the account, because only the wallet's history says
// whether the money was deposited or won.
export function CbaLedgerMoveCard({ walletId, canManage }: { walletId: string; canManage: boolean }) {
  const [preview, setPreview] = useState<CbaLedgerBalancePreview | null>(null);
  const [purpose, setPurpose] = useState<CbaAccountPurpose | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPreview(await api.cba.adminLedgerBalance(walletId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the ledger balance.');
    }
  }, [walletId]);

  useEffect(() => { void load(); }, [load]);

  const move = async () => {
    if (!preview || !purpose) return;
    if (!window.confirm(`Move ${formatNaira(preview.ledgerAvailableNgn)} to the ${PURPOSE_LABEL[purpose].toLowerCase()}? This happens once per wallet.`)) return;
    setMoving(true);
    setError(null);
    try {
      await api.cba.adminMoveLedgerBalance(walletId, purpose);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The balance was not moved.');
    } finally {
      setMoving(false);
    }
  };

  if (!preview && !error) return null;

  const migration = preview?.migration ?? null;
  const ready = preview?.cbaState === 'READY';
  const blocked = !preview || !ready || preview.ledgerHeldNgn > 0 || preview.ledgerAvailableNgn <= 0;

  return (
    <SectionCard
      title="Move ledger balance to CBA"
      description="A one-time move of this wallet's old SureWina-ledger balance onto its CBA account. Finance must also move the cash into the Monnify vault; the daily reconciliation shows a shortfall until it does."
    >
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {preview && (
        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label="Ledger available" value={formatNaira(preview.ledgerAvailableNgn)} />
            <Fact label="Ledger held" value={formatNaira(preview.ledgerHeldNgn)} />
            <Fact label="CBA accounts" value={preview.cbaState === 'READY' ? 'Ready' : preview.cbaState.replaceAll('_', ' ').toLowerCase()} />
          </div>

          {migration ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={migration.status === 'CREDITED' ? 'success' : migration.status === 'FAILED' ? 'neutral' : 'danger'}>{migration.status}</StatusPill>
                <span className="font-bold text-navy-900">{formatNaira(migration.amountNgn)} → {PURPOSE_LABEL[migration.purpose]}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Started {new Date(migration.createdAt).toLocaleString('en-NG')}
                {migration.creditedAt ? ` · credited ${new Date(migration.creditedAt).toLocaleString('en-NG')}` : ''}
                {migration.failureReason ? ` · ${migration.failureReason}` : ''}
              </p>
              {migration.status === 'REVIEW_REQUIRED' && canManage && (
                <button type="button" onClick={() => void api.cba.adminMoveLedgerBalance(walletId, migration.purpose).then(load, (err) => setError(err instanceof Error ? err.message : 'Check failed.'))} className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-navy-700">
                  Check the CBA again
                </button>
              )}
            </div>
          ) : !canManage ? (
            <p className="text-slate-500">Not moved yet.</p>
          ) : !ready ? (
            <p className="text-slate-500">The wallet's CBA accounts must be ready first.</p>
          ) : preview.ledgerHeldNgn > 0 ? (
            <p className="text-slate-500">Ledger holds are in progress. Wait for them to finish.</p>
          ) : preview.ledgerAvailableNgn <= 0 ? (
            <p className="text-slate-500">There is no ledger balance to move.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Destination</span>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value as CbaAccountPurpose | '')} className="mt-1 block rounded-md border border-slate-300 px-3 py-2">
                  <option value="">Choose…</option>
                  {preview.allowedPurposes.map((p) => (
                    <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void move()} disabled={blocked || !purpose || moving} className="rounded-md bg-navy-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {moving ? 'Moving…' : `Move ${formatNaira(preview.ledgerAvailableNgn)}`}
              </button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-black text-navy-900">{value}</p>
    </div>
  );
}
