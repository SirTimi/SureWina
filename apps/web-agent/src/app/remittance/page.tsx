'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, Banknote, Building2, CheckCircle2, Copy, History, Wallet } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { api } from '@/lib/api';

// Real Surewina remittance pool account (static config, not per-agent).
const REMIT_BANK = {
  bankName: 'Guaranty Trust Bank',
  accountNumber: '0123456789',
  accountName: 'SUREWINA REMIT POOL',
};

interface Remittance {
  remittanceId: string;
  periodDate: string;
  grossSalesNgn: number;
  commissionNgn: number;
  winningsPaidOutNgn: number;
  amountDueNgn: number;
  ticketCount: number;
  status: string;
  bankTransferRef: string | null;
}

export default function RemittancePage() {
  return (
    <AgentShell>
      {() => <RemittanceBody />}
    </AgentShell>
  );
}

function RemittanceBody() {
  const [totalOwed, setTotalOwed] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.agents
      .remittanceCurrent()
      .then((res) => {
        setTotalOwed(res.totalOwedNgn);
        setWalletBalance(res.walletBalanceNgn);
        setRemittances(res.remittances);
      })
      .catch(() => {
        setTotalOwed(0);
        setWalletBalance(0);
        setRemittances([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Remittance"
        title="Settle your remittance"
        description="You hold customer money until you remit it. Settle each day's balance by 11am the next day."
        backHref="/"
        rightSlot={
          <Link href="/remittance/history">
            <Button variant="secondary" className="rounded-sm border-navy-200 bg-white text-navy-700">
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
        }
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
          Total owed right now
        </p>
        <p className="mt-2 font-display text-5xl font-black tracking-[-0.04em] text-navy-950 tabular-nums">
          {formatNaira(totalOwed)}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Across {remittances.length} open remittance period{remittances.length === 1 ? '' : 's'}, after your commission.
        </p>
      </Card>

      {/* Credit from days where prize payouts exceeded sales. Shown only when
          there is a balance — an empty wallet is noise on a settlement page. */}
      {walletBalance > 0 && (
        <Card className="mt-4 rounded-3xl border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-white text-emerald-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
                Wallet balance
              </p>
              <p className="mt-1 font-display text-3xl font-black text-navy-950 tabular-nums">
                {formatNaira(walletBalance)}
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                Surewina owes you this from days your prize payouts were more than your sales.
                You can use it to settle any day below.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Bank transfer instructions
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Transfer to the Surewina pool, then enter your transfer reference on each period below.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <InstructionRow label="Bank" value={REMIT_BANK.bankName} onCopy={() => copy('bank', REMIT_BANK.bankName)} copied={copied === 'bank'} />
          <InstructionRow label="Account number" value={REMIT_BANK.accountNumber} onCopy={() => copy('account', REMIT_BANK.accountNumber)} copied={copied === 'account'} mono />
          <InstructionRow label="Account name" value={REMIT_BANK.accountName} onCopy={() => copy('name', REMIT_BANK.accountName)} copied={copied === 'name'} />
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {remittances.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-display text-xl font-black text-navy-950">All settled.</p>
            <p className="mt-1 text-sm text-slate-500">No open remittance periods right now.</p>
          </Card>
        ) : (
          remittances.map((r) => (
            <RemittanceRow
              key={r.remittanceId}
              remittance={r}
              walletBalanceNgn={walletBalance}
              onConfirmed={load}
            />
          ))
        )}
      </div>
    </main>
  );
}

function RemittanceRow({
  remittance: r,
  walletBalanceNgn,
  onConfirmed,
}: {
  remittance: Remittance;
  walletBalanceNgn: number;
  onConfirmed: () => void;
}) {
  const [ref, setRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LATE is the enum value for an unsettled overdue period. The previous
  // check tested for 'OVERDUE', which does not exist — so a late day was
  // treated as already paid and the agent had no way to settle it.
  const overdue = r.status === 'LATE';
  const settled = r.status !== 'PENDING' && !overdue;
  const canUseWallet = walletBalanceNgn >= r.amountDueNgn;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setSubmitting(true);
    try {
      await fn();
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not settle this period.');
      setSubmitting(false);
    }
  };

  const confirm = () => {
    if (ref.trim().length < 4) {
      setError('Enter the bank transfer reference from your receipt.');
      return;
    }
    return run(() => api.agents.confirmRemittance(r.remittanceId, ref.trim()));
  };

  const payFromWallet = () =>
    run(() => api.agents.settleFromWallet(r.remittanceId));

  return (
    <Card className={`rounded-3xl border p-5 shadow-sm ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">{r.periodDate}</p>
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </span>
            )}
            {settled && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> {r.status}
              </span>
            )}
          </div>
          <p className="mt-2 font-display text-3xl font-black tracking-[-0.03em] text-navy-950 tabular-nums">
            {formatNaira(r.amountDueNgn)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {r.ticketCount} tickets · {formatNaira(r.grossSalesNgn)} gross · {formatNaira(r.commissionNgn)} commission
            {r.winningsPaidOutNgn > 0 && <> · {formatNaira(r.winningsPaidOutNgn)} prizes paid</>}
          </p>
        </div>
      </div>

      {settled ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Payment logged{r.bankTransferRef ? ` · ref ${r.bankTransferRef}` : ''}. Awaiting finance reconciliation.
        </div>
      ) : (
        <>
          {canUseWallet && (
            <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-emerald-900">
                Your wallet covers this day. No transfer needed.
              </p>
              <Button
                variant="secondary"
                isLoading={submitting}
                disabled={submitting}
                onClick={payFromWallet}
                className="rounded-sm border-emerald-300 bg-white font-black text-emerald-800"
              >
                <Wallet className="h-4 w-4" />
                Settle from wallet
              </Button>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Bank transfer reference"
              className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 font-mono text-sm text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
            />
            <Button
              variant="accent"
              size="lg"
              isLoading={submitting}
              disabled={submitting}
              onClick={confirm}
              className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
            >
              <Banknote className="h-5 w-5" />
              Confirm payment
            </Button>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}

function InstructionRow({
  label, value, onCopy, copied, mono = false,
}: { label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#F8FAF4] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
        <p className={mono ? 'mt-1 truncate font-mono text-base font-black text-navy-950' : 'mt-1 truncate text-base font-bold text-navy-950'}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy-700"
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}