'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Landmark,
  KeyRound,
  Loader2,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type {
  AgentCbaWalletView,
  CbaWithdrawalStatus,
  CbaWithdrawalView,
  WalletPinStatus,
  WithdrawalAccountView,
} from '@surewina/api-client';
import { api } from '@/lib/api';

type Bank = { code: string; name: string };

// The agent's bank-transfer wallet at SureWina's core banking provider.
//
// Float pays for every ticket sold, in full. Earnings collects commission
// and reimbursed prizes, and is the only part that can be withdrawn — to a
// bank account in the agent's own name. Shown above the existing wallet,
// which keeps working as before.
export function AgentCbaWalletPanel() {
  const [view, setView] = useState<AgentCbaWalletView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api.cba.agentWallet());
      setError(null);
    } catch (err) {
      setError(message(err, 'Could not load your Float and Earnings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="h-40 animate-pulse rounded-3xl bg-white" />;
  if (error || !view) return <Notice tone="error" title={error ?? 'Could not load your Float and Earnings.'} />;

  // Not moved onto the bank-transfer wallet yet: nothing to show.
  if (view.state === 'NONE') return null;

  if (view.state !== 'READY') {
    return (
      <Notice
        tone="info"
        title="Your Float and Earnings accounts are being set up by SureWina. Keep selling from your current wallet meanwhile."
      />
    );
  }

  const float = view.accounts.find((a) => a.purpose === 'FLOAT');
  const earnings = view.accounts.find((a) => a.purpose === 'EARNINGS');
  const unavailable = !view.available;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-3xl border-navy-100 bg-navy-800 text-white shadow-[0_24px_70px_rgba(14,42,71,0.18)]">
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-sm bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em]">
              <WalletCards className="h-4 w-4" />
              Bank-transfer wallet
            </div>
            <button type="button" onClick={() => void load()} className="rounded-sm bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15">
              Refresh
            </button>
          </div>

          {unavailable && (
            <p className="mt-4 text-sm text-white/70">
              Balances are temporarily unavailable. Your money is safe; try again shortly.
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Balance label="Float" hint="Pays for tickets you sell" value={unavailable ? null : float?.availableNgn ?? 0} />
            <Balance label="Earnings" hint="Commission and repaid prizes — withdrawable" value={unavailable ? null : earnings?.availableNgn ?? 0} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <FundFloatCard funding={view.funding} onIssued={() => void load()} />
        <WithdrawCard withdrawableNgn={view.withdrawableNgn} onChanged={() => void load()} />
      </div>
    </div>
  );
}

function Balance({ label, hint, value }: { label: string; hint: string; value: number | null }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums">{value === null ? '—' : formatNaira(value)}</p>
      <p className="mt-1 text-xs text-white/50">{hint}</p>
    </div>
  );
}

// ─── Funding Float ─────────────────────────────────────────

function FundFloatCard({ funding, onIssued }: { funding: AgentCbaWalletView['funding']; onIssued: () => void }) {
  const [bvn, setBvn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.cba.agentFundingAccount(bvn);
      setBvn('');
      if (result.status === 'NOT_AVAILABLE') {
        setError('Funding by bank transfer is not available yet.');
      }
      onIssued();
    } catch (err) {
      setError(message(err, 'We could not issue your account number.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle eyebrow="Fund your Float" title="Transfer to your account" />

      {funding.status === 'READY' && funding.accounts.length > 0 ? (
        <>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            Send money from any bank app to this account. It arrives in your Float, usually within minutes.
          </p>
          <div className="space-y-3">
            {funding.accounts.map((a) => (
              <BankAccountRow key={a.accountNumber} {...a} />
            ))}
          </div>
        </>
      ) : funding.status === 'BEING_SET_UP' ? (
        <Notice tone="info" title="Your account number is being issued. Check back shortly." />
      ) : (
        <form onSubmit={issue} className="space-y-4">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" />
            <p className="text-sm leading-relaxed text-slate-500">
              Get your own account number for funding Float. Enter the BVN you gave when you were onboarded; it is checked and never stored.
            </p>
          </div>
          <Field label="Your BVN">
            <input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          {error && <Notice tone="error" title={error} />}
          <Button type="submit" variant="accent" disabled={busy || bvn.length !== 11} className={accentButton}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Issuing…</> : 'Get my account number'}
          </Button>
        </form>
      )}
    </Card>
  );
}

function BankAccountRow({ bankName, accountNumber, accountName }: { bankName: string; accountNumber: string; accountName: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-navy-50/40 p-4">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{bankName}</p>
        <p className="mt-0.5 font-mono text-xl font-black tracking-wider text-navy-950">{accountNumber}</p>
        <p className="truncate text-xs text-slate-500">{accountName}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(accountNumber);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-navy-800"
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ─── Withdrawing Earnings ──────────────────────────────────

function WithdrawCard({ withdrawableNgn, onChanged }: { withdrawableNgn: number | null; onChanged: () => void }) {
  const [accounts, setAccounts] = useState<WithdrawalAccountView[]>([]);
  const [history, setHistory] = useState<CbaWithdrawalView[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState<WalletPinStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, w, p] = await Promise.all([api.cba.agentWithdrawalAccounts(), api.cba.agentWithdrawals(), api.cba.agentPinStatus()]);
      setAccounts(a);
      setHistory(w);
      setPin(p);
      setError(null);
    } catch (err) {
      setError(message(err, 'Could not load withdrawals.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    api.cba
      .agentBanks()
      .then((r) => setBanks(r.banks))
      .catch(() => setBanks([]));
  }, [load]);

  return (
    <Card className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle eyebrow="Withdraw earnings" title="Cash out to your bank" />

      {loading ? (
        <div className="h-24 animate-pulse rounded-sm bg-slate-100" />
      ) : error ? (
        <Notice tone="error" title={error} />
      ) : (
        <div className="space-y-6">
          {pin && (
            <PinSection
              status={pin}
              pinApi={{ set: (p) => api.cba.agentSetPin(p), change: (c, n) => api.cba.agentChangePin(c, n), reset: (b, n) => api.cba.agentResetPin(b, n) }}
              onChanged={setPin}
            />
          )}

          {pin?.set && (
          <>
          <WithdrawForm
            accounts={accounts.filter((a) => a.usable)}
            withdrawableNgn={withdrawableNgn}
            onDone={() => {
              void load();
              onChanged();
            }}
          />

          <SavedAccounts
            accounts={accounts}
            banks={banks}
            adding={adding}
            setAdding={setAdding}
            onRemove={async (id) => {
              await api.cba.agentRemoveWithdrawalAccount(id);
              await load();
            }}
            onAdd={async (input) => {
              await api.cba.agentAddWithdrawalAccount(input);
              setAdding(false);
              await load();
            }}
          />
          </>
          )}

          {history.length > 0 && (
            <div className="border-t border-slate-100 pt-5">
              <p className="mb-3 text-sm font-black text-navy-950">Recent withdrawals</p>
              <div className="divide-y divide-slate-100">
                {history.slice(0, 8).map((w) => (
                  <div key={w.withdrawalId} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-bold text-navy-950">{formatNaira(w.amountNgn)}</p>
                      <p className="text-xs text-slate-500">•••• {w.accountLast4} · {formatWhen(w.createdAt)}</p>
                    </div>
                    <StatusPill status={w.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function WithdrawForm({
  accounts,
  withdrawableNgn,
  onDone,
}: {
  accounts: WithdrawalAccountView[];
  withdrawableNgn: number | null;
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].withdrawalAccountId);
  }, [accounts, accountId]);

  if (accounts.length === 0) {
    return <Notice tone="info" title="Add a bank account in your name to withdraw. New accounts can be used after a short waiting period, for your security." />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    const amountNgn = Number(amount);

    if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
      setResult({ tone: 'error', text: 'Enter a whole-naira amount.' });
      return;
    }

    setSubmitting(true);
    try {
      if (!/^\d{4}$/.test(pin)) {
        setResult({ tone: 'error', text: 'Enter your 4-digit withdrawal PIN.' });
        return;
      }
      const withdrawal = await api.cba.agentWithdraw({ withdrawalAccountId: accountId, amountNgn, requestId, pin });
      setResult({ tone: withdrawal.status === 'SUCCEEDED' ? 'success' : 'info', text: withdrawalMessage(withdrawal.status) });
      setAmount('');
      setRequestId(newRequestId());
      onDone();
    } catch (err) {
      setResult({ tone: 'error', text: message(err, 'Your withdrawal could not be made.') });
    } finally {
      setPin('');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500">
        Withdrawable now: <span className="font-black text-navy-950">{withdrawableNgn === null ? '—' : formatNaira(withdrawableNgn)}</span>
      </p>
      <Field label="To">
        <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.withdrawalAccountId} value={a.withdrawalAccountId}>
              {(a.bankName ?? a.bankCode) + ' •••• ' + a.accountLast4 + (a.accountName ? ` — ${a.accountName}` : '')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="5000" />
      </Field>
      <Field label="Withdrawal PIN">
        <input className={inputClass} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {result && <Notice tone={result.tone} title={result.text} />}
      <Button type="submit" variant="accent" fullWidth disabled={submitting} className={accentButton}>
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Withdraw <ArrowUpRight className="h-4 w-4" /></>}
      </Button>
    </form>
  );
}

function SavedAccounts({
  accounts,
  banks,
  adding,
  setAdding,
  onRemove,
  onAdd,
}: {
  accounts: WithdrawalAccountView[];
  banks: Bank[];
  adding: boolean;
  setAdding: (v: boolean) => void;
  onRemove: (id: string) => Promise<void>;
  onAdd: (input: { bankCode: string; bankName?: string; accountNumber: string; bvn: string; pin: string }) => Promise<void>;
}) {
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bvn, setBvn] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bankName = useMemo(() => banks.find((b) => b.code === bankCode)?.name, [banks, bankCode]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onAdd({ bankCode, bankName, accountNumber, bvn, pin });
      setAccountNumber('');
      setBvn('');
    } catch (err) {
      setError(message(err, 'We could not save this account.'));
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-navy-950">Your withdrawal accounts</p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm font-bold text-navy-700">
            + Add account
          </button>
        )}
      </div>

      {accounts.length === 0 && !adding && <p className="text-sm text-slate-500">No accounts saved yet.</p>}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.withdrawalAccountId} className="flex items-center justify-between gap-3 rounded-sm border border-slate-200 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <Building2 className="h-4 w-4 shrink-0 text-navy-700" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy-950">{(a.bankName ?? a.bankCode) + ' •••• ' + a.accountLast4}</p>
                <p className="truncate text-xs text-slate-500">
                  {a.usable ? a.accountName ?? 'Verified' : <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Ready to use {a.usableFrom ? formatWhen(a.usableFrom) : 'soon'}</span>}
                </p>
              </div>
            </div>
            <button type="button" aria-label="Remove account" onClick={() => void onRemove(a.withdrawalAccountId)} className="rounded-sm p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <form onSubmit={add} className="mt-4 space-y-3 rounded-sm border border-navy-100 bg-navy-50/40 p-4">
          <p className="text-xs leading-relaxed text-slate-600">
            The account must be in your own name. We check it against your BVN; your BVN is not stored.
          </p>
          <Field label="Bank">
            {banks.length > 0 ? (
              <select className={inputClass} value={bankCode} onChange={(e) => setBankCode(e.target.value)} required>
                <option value="">Choose your bank</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            ) : (
              <input className={inputClass} placeholder="Bank code" value={bankCode} onChange={(e) => setBankCode(e.target.value.replace(/\D/g, ''))} required />
            )}
          </Field>
          <Field label="Account number">
            <input className={inputClass} inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          <Field label="Your BVN">
            <input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          <Field label="Withdrawal PIN">
            <input className={inputClass} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
          </Field>
          {error && <Notice tone="error" title={error} />}
          <div className="flex gap-2">
            <Button type="submit" variant="accent" disabled={busy} className={accentButton}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : 'Save account'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Small pieces ──────────────────────────────────────────

const STATUS_LABEL: Record<CbaWithdrawalStatus, { label: string; tone: string }> = {
  LOCKING: { label: 'Starting', tone: 'bg-slate-100 text-slate-700' },
  FAILED: { label: 'Not made', tone: 'bg-red-50 text-red-700' },
  AWAITING_APPROVAL: { label: 'Being reviewed', tone: 'bg-amber-50 text-amber-800' },
  LOCKED: { label: 'Processing', tone: 'bg-amber-50 text-amber-800' },
  PAYOUT_PENDING: { label: 'On its way', tone: 'bg-amber-50 text-amber-800' },
  PAID: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700' },
  SUCCEEDED: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700' },
  RESTORED: { label: 'Returned to Earnings', tone: 'bg-slate-100 text-slate-700' },
  REVIEW_REQUIRED: { label: 'Being checked', tone: 'bg-amber-50 text-amber-800' },
};

function StatusPill({ status }: { status: CbaWithdrawalStatus }) {
  const s = STATUS_LABEL[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>{s.label}</span>;
}

function withdrawalMessage(status: CbaWithdrawalStatus): string {
  switch (status) {
    case 'SUCCEEDED':
    case 'PAID':
      return 'Done. The money has been sent to your bank.';
    case 'AWAITING_APPROVAL':
      return 'Your withdrawal is with SureWina for a quick check. The amount is set aside meanwhile.';
    case 'RESTORED':
      return 'Your bank could not receive it, so the money is back in your Earnings.';
    default:
      return 'Your withdrawal is on its way. It usually arrives within minutes.';
  }
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">{eyebrow}</p>
      <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-navy-950">{label}</span>
      {children}
    </label>
  );
}

function Notice({ tone, title }: { tone: 'success' | 'error' | 'info'; title: string }) {
  const style =
    tone === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
      : tone === 'error'
        ? 'border-red-100 bg-red-50 text-red-700'
        : 'border-navy-100 bg-navy-50 text-navy-800';
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className={`flex items-start gap-2 rounded-sm border p-3 text-sm ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{title}</span>
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-sm border border-slate-200 bg-white px-3 text-sm font-semibold text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25';

const accentButton =
  'rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400';

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type PinApi = {
  set: (pin: string) => Promise<WalletPinStatus>;
  change: (currentPin: string, newPin: string) => Promise<WalletPinStatus>;
  reset: (bvn: string, newPin: string) => Promise<WalletPinStatus>;
};

// The 4-digit PIN needed to withdraw and to save a bank account. Set once;
// changed with the current PIN; reset with the BVN if forgotten.
function PinSection({ status, pinApi, onChanged }: { status: WalletPinStatus; pinApi: PinApi; onChanged: (s: WalletPinStatus) => void }) {
  const [mode, setMode] = useState<'idle' | 'change' | 'reset'>('idle');
  const [current, setCurrent] = useState('');
  const [bvn, setBvn] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const clear = () => {
    setCurrent('');
    setBvn('');
    setPin('');
    setConfirm('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    if (pin !== confirm) {
      setError('The two PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      const next = !status.set
        ? await pinApi.set(pin)
        : mode === 'change'
          ? await pinApi.change(current, pin)
          : await pinApi.reset(bvn, pin);
      setDone(!status.set ? 'Your withdrawal PIN is set.' : 'Your withdrawal PIN has been updated.');
      clear();
      setMode('idle');
      onChanged(next);
    } catch (err) {
      setError(message(err, 'Your PIN could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (value: string, set: (v: string) => void) => (
    <input
      className={inputClass}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      required
    />
  );

  if (status.set && mode === 'idle') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-slate-200 p-3">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-navy-950">
          <KeyRound className="h-4 w-4 text-navy-700" />
          {status.lockedUntil ? `PIN locked until ${formatWhen(status.lockedUntil)}` : 'Withdrawal PIN is set'}
        </p>
        <div className="flex gap-3 text-sm font-bold text-navy-700">
          <button type="button" onClick={() => { setMode('change'); setDone(null); }}>Change PIN</button>
          <button type="button" onClick={() => { setMode('reset'); setDone(null); }}>Forgot PIN?</button>
        </div>
        {done && <div className="w-full"><Notice tone="success" title={done} /></div>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-sm border border-navy-100 bg-navy-50/40 p-4">
      <p className="inline-flex items-center gap-2 text-sm font-black text-navy-950">
        <KeyRound className="h-4 w-4 text-navy-700" />
        {!status.set ? 'Set your withdrawal PIN' : mode === 'change' ? 'Change your PIN' : 'Reset your PIN'}
      </p>
      <p className="text-xs leading-relaxed text-slate-600">
        {!status.set
          ? 'You will enter this 4-digit PIN every time you withdraw or add a bank account. Avoid easy PINs like 1234 or 0000.'
          : mode === 'reset'
            ? 'Enter the BVN you verified your wallet with, then choose a new PIN.'
            : 'Five wrong tries lock your PIN for 30 minutes.'}
      </p>
      {status.set && mode === 'change' && <Field label="Current PIN">{pinInput(current, setCurrent)}</Field>}
      {status.set && mode === 'reset' && (
        <Field label="Your BVN">
          <input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={11} value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))} required />
        </Field>
      )}
      <Field label={status.set ? 'New PIN' : 'PIN'}>{pinInput(pin, setPin)}</Field>
      <Field label="Confirm PIN">{pinInput(confirm, setConfirm)}</Field>
      {error && <Notice tone="error" title={error} />}
      <div className="flex gap-2">
        <Button type="submit" variant="accent" disabled={busy} className={accentButton}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save PIN'}
        </Button>
        {status.set && (
          <Button type="button" variant="secondary" onClick={() => { clear(); setError(null); setMode('idle'); }}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
