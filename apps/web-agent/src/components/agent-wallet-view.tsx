'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type {
  WalletFundingGateway,
  WalletFundingView,
  WalletLedgerTransaction,
  WalletView,
} from '@surewina/api-client';
import type { AgentMe } from '@surewina/types';
import { AgentShell } from '@/components/agent-shell';
import { api } from '@/lib/api';

interface AgentWalletScreenProps {
  fundingReference: string | null;
  providerTransactionId: string | null;
  callbackError: string | null;
}

export function AgentWalletScreen(props: AgentWalletScreenProps) {
  return (
    <AgentShell>
      {(agent) => <AgentWalletView agent={agent} {...props} />}
    </AgentShell>
  );
}

function AgentWalletView({
  agent,
  fundingReference,
  providerTransactionId,
  callbackError,
}: AgentWalletScreenProps & {
  agent: AgentMe;
}) {
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [fundings, setFundings] = useState<WalletFundingView[]>([]);
  const [transactions, setTransactions] = useState<WalletLedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState('5000');
  const [gateway, setGateway] = useState<WalletFundingGateway>('MONNIFY');
  const [startingFunding, setStartingFunding] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);

  const [returnedFunding, setReturnedFunding] = useState<WalletFundingView | null>(null);
  const [checkingReturnedFunding, setCheckingReturnedFunding] = useState(false);
  const [returnedFundingError, setReturnedFundingError] = useState<string | null>(null);

  const loadWalletData = useCallback(async () => {
    setLoadError(null);

    try {
      const [walletResult, fundingResult, historyResult] = await Promise.all([
        api.agents.wallet(),
        api.agents.walletFundingHistory(1, 10),
        api.agents.walletHistory(1, 10),
      ]);

      setWallet(walletResult);
      setFundings(fundingResult.fundings);
      setTransactions(historyResult.transactions);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load your agent wallet.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyReturnedFunding = useCallback(async () => {
    if (!fundingReference) return;

    setCheckingReturnedFunding(true);
    setReturnedFundingError(null);

    try {
      const funding = await api.agents.walletFundingStatus(
        fundingReference,
        providerTransactionId ?? undefined,
      );

      setReturnedFunding(funding);

      if (funding.status === 'CREDITED') {
        await loadWalletData();
      } else {
        const fundingHistory = await api.agents.walletFundingHistory(1, 10);
        setFundings(fundingHistory.fundings);
      }
    } catch (error) {
      setReturnedFundingError(
        error instanceof Error
          ? error.message
          : 'Could not verify this wallet top-up.',
      );
    } finally {
      setCheckingReturnedFunding(false);
    }
  }, [fundingReference, providerTransactionId, loadWalletData]);

  useEffect(() => {
    void loadWalletData();
  }, [loadWalletData]);

  useEffect(() => {
    if (fundingReference) {
      void verifyReturnedFunding();
    }
  }, [fundingReference, verifyReturnedFunding]);

  const parsedAmount = useMemo(() => Number(amount), [amount]);

  const handleTopUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFundingError(null);

    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setFundingError('Enter a valid whole-naira amount.');
      return;
    }

    setStartingFunding(true);

    try {
      const funding = await api.agents.initiateWalletFunding({
        gateway,
        amountNgn: parsedAmount,
      });

      window.location.assign(funding.authorizationUrl);
    } catch (error) {
      setFundingError(
        error instanceof Error
          ? error.message
          : 'Could not start wallet funding.',
      );
      setStartingFunding(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-10 pt-5">
      <section className="mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
          Agent wallet
        </p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
          Wallet and top-ups
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          Fund your SureWina agent wallet with Monnify or Flutterwave and review every
          verified wallet movement. Agent {agent.agentCode}.
        </p>
      </section>

      {callbackError === 'missing-reference' && (
        <StatusNotice
          tone="error"
          title="We could not identify that top-up."
          body="No payment reference was returned by the payment provider. Your wallet has not been changed."
        />
      )}

      {fundingReference && (
        <div className="mb-5">
          <ReturnedFundingStatus
            funding={returnedFunding}
            loading={checkingReturnedFunding}
            error={returnedFundingError}
            onRefresh={() => void verifyReturnedFunding()}
          />
        </div>
      )}

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-3xl bg-white" />
            <div className="h-72 animate-pulse rounded-3xl bg-white" />
          </div>
          <div className="h-96 animate-pulse rounded-3xl bg-white" />
        </div>
      ) : loadError || !wallet ? (
        <Card className="rounded-3xl border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-7 w-7 text-red-600" />
          <p className="mt-3 text-sm font-bold text-red-600">
            {loadError ?? 'Could not load your agent wallet.'}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-5"
            onClick={() => {
              setLoading(true);
              void loadWalletData();
            }}
          >
            Try again
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card className="overflow-hidden rounded-3xl border-navy-100 bg-navy-800 text-white shadow-[0_24px_70px_rgba(14,42,71,0.18)]">
              <div className="p-6 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-sm bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                      <WalletCards className="h-4 w-4" />
                      Available balance
                    </div>

                    <p className="mt-5 font-display text-4xl font-black tracking-[-0.04em] text-white tabular-nums sm:text-5xl">
                      {formatNaira(wallet.availableNgn)}
                    </p>

                    <p className="mt-2 text-sm text-white/70">
                      Available for wallet-backed agent activity.
                    </p>
                  </div>

                  <span
                    className={
                      wallet.status === 'ACTIVE'
                        ? 'inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-100'
                        : 'inline-flex w-fit items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-100'
                    }
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {wallet.status}
                  </span>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
                  <BalanceDetail label="Held" value={wallet.heldNgn} />
                  <BalanceDetail label="Total" value={wallet.totalNgn} />
                </div>
              </div>
            </Card>

            <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                    Wallet activity
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                    Recent movements
                  </h2>
                </div>
                <p className="text-xs text-slate-400">
                  Latest {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
                </p>
              </div>

              {transactions.length === 0 ? (
                <EmptyState
                  title="No wallet activity yet"
                  body="Verified top-ups and future wallet movements will appear here."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {transactions.map((transaction) => (
                    <WalletTransactionRow
                      key={transaction.ledgerTxnId}
                      transaction={transaction}
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                  Funding history
                </p>
                <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                  Recent top-ups
                </h2>
              </div>

              {fundings.length === 0 ? (
                <EmptyState
                  title="No top-ups yet"
                  body="Your provider payments and verification status will appear here."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {fundings.map((funding) => (
                    <FundingRow key={funding.fundingId} funding={funding} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-amber-100 text-navy-800">
                <CreditCard className="h-5 w-5" />
              </div>

              <h2 className="mt-4 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                Top up wallet
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Add money through a secure hosted checkout. SureWina credits the wallet only after provider verification.
              </p>

              <form className="mt-6 space-y-5" onSubmit={handleTopUp}>
                <div>
                  <label
                    htmlFor="agent-wallet-top-up-amount"
                    className="mb-2 block text-sm font-bold text-navy-950"
                  >
                    Amount
                  </label>

                  <div className="flex h-12 overflow-hidden rounded-sm border border-slate-200 bg-white focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/25">
                    <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-black text-navy-950">
                      ₦
                    </span>
                    <input
                      id="agent-wallet-top-up-amount"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="min-w-0 flex-1 px-3 text-base font-bold text-navy-950 outline-none"
                      placeholder="5000"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold text-navy-950">
                    Payment provider
                  </p>
                  <div className="grid gap-2">
                    <ProviderOption
                      name="Monnify"
                      selected={gateway === 'MONNIFY'}
                      onSelect={() => setGateway('MONNIFY')}
                    />
                    <ProviderOption
                      name="Flutterwave"
                      selected={gateway === 'FLUTTERWAVE'}
                      onSelect={() => setGateway('FLUTTERWAVE')}
                    />
                  </div>
                </div>

                {fundingError && (
                  <div className="flex items-start gap-2 rounded-sm border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{fundingError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="accent"
                  fullWidth
                  disabled={startingFunding || wallet.status !== 'ACTIVE' || agent.status !== 'ACTIVE'}
                  className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
                >
                  {startingFunding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting payment…
                    </>
                  ) : (
                    <>
                      Continue to {gateway === 'MONNIFY' ? 'Monnify' : 'Flutterwave'}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {agent.status !== 'ACTIVE' && (
                <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">
                  Top-ups are unavailable while your agent account is {agent.status.toLowerCase().replace('_', ' ')}.
                </div>
              )}

              <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
                Payment status returned by the browser is never enough to credit your wallet. The API verifies with the provider first.
              </div>
            </Card>

            <Card className="rounded-3xl border-navy-100 bg-amber-50 p-5 shadow-sm">
              <p className="text-sm font-black text-navy-950">
                Prepaid selling is active.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                New ticket sales settle against this wallet immediately. Your commission is retained at sale time, and eligible agent-paid prizes are reimbursed back into this wallet. Any old remittance balance is historical and separate.
              </p>
              <Link
                href="/remittance"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-navy-700"
              >
                View historical remittance
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          </aside>
        </div>
      )}
    </main>
  );
}

function BalanceDetail({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-black text-white tabular-nums">
        {formatNaira(value)}
      </p>
    </div>
  );
}

function ProviderOption({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        selected
          ? 'rounded-sm border border-navy-700 bg-navy-50 p-3 text-left ring-2 ring-amber-400/25'
          : 'rounded-sm border border-slate-200 bg-white p-3 text-left transition hover:bg-[#F8FAF4]'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-navy-950">{name}</p>
          <p className="mt-0.5 text-xs text-slate-500">Secure hosted checkout</p>
        </div>
        <span
          className={
            selected
              ? 'flex h-4 w-4 rounded-full border-4 border-navy-700 bg-white'
              : 'h-4 w-4 rounded-full border border-slate-300 bg-white'
          }
          aria-hidden="true"
        />
      </div>
    </button>
  );
}

function ReturnedFundingStatus({
  funding,
  loading,
  error,
  onRefresh,
}: {
  funding: WalletFundingView | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading && !funding) {
    return (
      <StatusNotice
        tone="info"
        title="Verifying your top-up"
        body="SureWina is checking the payment directly with the provider before updating your wallet."
        loading
      />
    );
  }

  if (error) {
    return (
      <StatusNotice
        tone="error"
        title="We could not verify the top-up yet"
        body={error}
        action={
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 text-sm font-bold text-red-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try verification again
          </button>
        }
      />
    );
  }

  if (!funding) return null;

  if (funding.status === 'CREDITED') {
    return (
      <StatusNotice
        tone="success"
        title="Wallet credited"
        body={`${formatNaira(funding.amountNgn)} was verified and added to your agent wallet.`}
      />
    );
  }

  if (funding.status === 'FAILED') {
    return (
      <StatusNotice
        tone="error"
        title="Top-up failed"
        body="The provider did not confirm this payment. Your wallet was not credited."
      />
    );
  }

  if (funding.status === 'REVIEW_REQUIRED') {
    return (
      <StatusNotice
        tone="warning"
        title="Top-up needs review"
        body="SureWina found a mismatch while verifying the provider payment. Your wallet has not been credited automatically."
      />
    );
  }

  return (
    <StatusNotice
      tone="info"
      title="Payment is still processing"
      body="The provider has not completed verification yet. Refresh this payment rather than creating another top-up."
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-bold text-navy-700 disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh status
        </button>
      }
    />
  );
}

function StatusNotice({
  tone,
  title,
  body,
  loading = false,
  action,
}: {
  tone: 'success' | 'warning' | 'error' | 'info';
  title: string;
  body: string;
  loading?: boolean;
  action?: ReactNode;
}) {
  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-navy-100 bg-navy-50 text-navy-800',
  }[tone];

  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : RefreshCw;

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function FundingRow({ funding }: { funding: WalletFundingView }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-base font-black text-navy-950">
            {formatNaira(funding.amountNgn)}
          </p>
          <FundingStatusPill status={funding.status} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {funding.gateway === 'MONNIFY' ? 'Monnify' : 'Flutterwave'} · {formatDate(funding.initiatedAt)}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
          {funding.reference}
        </p>
      </div>
      <p className="text-xs font-bold text-slate-500">
        {funding.creditedAt ? `Credited ${formatDate(funding.creditedAt)}` : 'Awaiting final credit'}
      </p>
    </div>
  );
}

function FundingStatusPill({ status }: { status: WalletFundingView['status'] }) {
  const classes =
    status === 'CREDITED'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'FAILED'
        ? 'bg-red-50 text-red-700'
        : status === 'REVIEW_REQUIRED'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-navy-50 text-navy-700';

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${classes}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function WalletTransactionRow({
  transaction,
}: {
  transaction: WalletLedgerTransaction;
}) {
  const delta = walletDelta(transaction);
  const incoming = delta > 0;
  const outgoing = delta < 0;
  const Icon = incoming ? ArrowDownLeft : outgoing ? ArrowUpRight : WalletCards;

  return (
    <div className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
      <div
        className={
          incoming
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700'
            : outgoing
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500'
        }
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-navy-950">
          {transaction.description ?? humanizeKind(transaction.kind)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {humanizeKind(transaction.kind)} · {formatDate(transaction.occurredAt)}
        </p>
      </div>

      <p
        className={
          incoming
            ? 'font-display text-base font-black text-emerald-700 tabular-nums'
            : outgoing
              ? 'font-display text-base font-black text-navy-950 tabular-nums'
              : 'text-xs font-bold text-slate-400'
        }
      >
        {delta === 0
          ? 'Balance move'
          : `${delta > 0 ? '+' : '-'}${formatNaira(Math.abs(delta))}`}
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <WalletCards className="mx-auto h-6 w-6 text-slate-400" />
      <p className="mt-3 text-sm font-black text-navy-950">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
        {body}
      </p>
    </div>
  );
}

function walletDelta(transaction: WalletLedgerTransaction) {
  return transaction.entries
    .filter((entry) => entry.belongsToWallet)
    .reduce(
      (sum, entry) =>
        sum + (entry.side === 'CREDIT' ? entry.amountNgn : -entry.amountNgn),
      0,
    );
}

function humanizeKind(kind: string) {
  return kind
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
