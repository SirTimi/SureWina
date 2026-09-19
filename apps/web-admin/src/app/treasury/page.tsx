'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  RefreshCw,
  Scale,
  Wallet,
} from 'lucide-react';

import type {
  AdminReconciliationIssue,
  AdminReconciliationRun,
  AdminTreasuryOverview,
  AdminTreasurySettlement,
} from '@surewina/api-client';
import { formatNaira } from '@surewina/utils';

import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { api } from '@/lib/api';

type Provider = 'MONNIFY' | 'FLUTTERWAVE';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoInput(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function startIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endIso(value: string) {
  return `${value}T23:59:59.999Z`;
}

function minorToNaira(value: string | null | undefined) {
  if (!value) return 0;
  return Number(value) / 100;
}

export default function TreasuryPage() {
  return (
    <AdminShell>
      {() => <TreasuryBody />}
    </AdminShell>
  );
}

function TreasuryBody() {
  const [overview, setOverview] =
    useState<AdminTreasuryOverview | null>(null);
  const [settlements, setSettlements] =
    useState<AdminTreasurySettlement[]>([]);
  const [runs, setRuns] =
    useState<AdminReconciliationRun[]>([]);
  const [issues, setIssues] =
    useState<AdminReconciliationIssue[]>([]);

  const [fromDate, setFromDate] =
    useState(daysAgoInput(2));
  const [toDate, setToDate] =
    useState(todayInput());
  const [provider, setProvider] =
    useState<Provider>('MONNIFY');

  const [bankBalance, setBankBalance] =
    useState('');
  const [bankReference, setBankReference] =
    useState('');

  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      const [
        overviewResult,
        settlementResult,
        runResult,
        issueResult,
      ] = await Promise.all([
        api.admin.treasuryOverview(),
        api.admin.treasurySettlements(),
        api.admin.treasuryReconciliationRuns(),
        api.admin.treasuryReconciliationIssues('OPEN'),
      ]);

      setOverview(overviewResult);
      setSettlements(settlementResult.settlements);
      setRuns(runResult.runs);
      setIssues(issueResult.issues);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load treasury data',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const criticalIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          issue.severity === 'CRITICAL',
      ).length,
    [issues],
  );

  const runRecon = async () => {
    setBusy('reconcile');
    setError(null);
    setNotice(null);

    try {
      const result =
        await api.admin.runTreasuryReconciliation(
          provider,
          startIso(fromDate),
          endIso(toDate),
        );

      setNotice(
        `${provider} reconciliation finished with ${result.issueCount} issue(s).`,
      );

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Reconciliation failed',
      );
    } finally {
      setBusy(null);
    }
  };

  const syncFlutterwave = async () => {
    setBusy('sync-flutterwave');
    setError(null);
    setNotice(null);

    try {
      const result =
        await api.admin.syncFlutterwaveSettlements(
          startIso(fromDate),
          endIso(toDate),
        );

      setNotice(
        `Flutterwave settlement sync processed ${result.settlements} settlement(s).`,
      );

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Flutterwave settlement sync failed',
      );
    } finally {
      setBusy(null);
    }
  };

  const snapshot = async (
    selected: Provider,
  ) => {
    setBusy(
      `snapshot-${selected}`,
    );
    setError(null);
    setNotice(null);

    try {
      await api.admin.snapshotTreasuryProviderBalance(
        selected,
      );

      setNotice(
        `${selected} payout-wallet balance snapshot recorded.`,
      );

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `${selected} balance snapshot failed`,
      );
    } finally {
      setBusy(null);
    }
  };

  const recordBank = async () => {
    const amount =
      Number(bankBalance);

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      setError(
        'Enter a valid non-negative bank balance',
      );
      return;
    }

    setBusy('bank');
    setError(null);
    setNotice(null);

    try {
      await api.admin.recordTreasuryBankBalance(
        amount,
        bankReference.trim() ||
          undefined,
      );

      setNotice(
        'Primary bank balance snapshot recorded.',
      );
      setBankBalance('');
      setBankReference('');
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not record bank balance',
      );
    } finally {
      setBusy(null);
    }
  };

  const resolveIssue = async (
    issueId: string,
    status:
      | 'RESOLVED'
      | 'IGNORED',
  ) => {
    const note =
      window.prompt(
        status === 'RESOLVED'
          ? 'Resolution note'
          : 'Reason for ignoring this exception',
        '',
      );

    if (note === null) {
      return;
    }

    setBusy(
      `issue-${issueId}`,
    );
    setError(null);

    try {
      await api.admin.resolveTreasuryIssue(
        issueId,
        status,
        note,
      );

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update reconciliation issue',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Treasury & reconciliation"
        description="Internal ledger balances versus Monnify, Flutterwave, settlements, payout wallets, and the primary bank."
      />

      <div className="mx-auto max-w-[1500px] space-y-5 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Metric
            icon={Scale}
            label="Open reconciliation issues"
            value={String(issues.length)}
            danger={issues.length > 0}
          />
          <Metric
            icon={AlertTriangle}
            label="Critical issues"
            value={String(criticalIssues)}
            danger={criticalIssues > 0}
          />
          <Metric
            icon={CheckCircle2}
            label="Treasury accounts"
            value={String(
              overview?.accounts.length ??
                0,
            )}
          />
        </div>

        <SectionCard
          title="Run reconciliation"
          description="Compare provider transaction history with SureWina payments, wallet funding, and collection journals."
        >
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-xs font-bold text-slate-600">
              Provider
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(
                    e.target.value as Provider,
                  )
                }
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="MONNIFY">
                  Monnify
                </option>
                <option value="FLUTTERWAVE">
                  Flutterwave
                </option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-600">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) =>
                  setFromDate(
                    e.target.value,
                  )
                }
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </label>

            <label className="text-xs font-bold text-slate-600">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) =>
                  setToDate(
                    e.target.value,
                  )
                }
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={runRecon}
              disabled={
                busy !== null
              }
              className="mt-auto h-10 rounded-md bg-navy-700 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {busy === 'reconcile'
                ? 'Reconciling…'
                : 'Run reconciliation'}
            </button>

            <button
              type="button"
              onClick={syncFlutterwave}
              disabled={
                busy !== null
              }
              className="mt-auto h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-navy-700 disabled:opacity-50"
            >
              {busy ===
              'sync-flutterwave'
                ? 'Syncing…'
                : 'Sync Flutterwave settlements'}
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Money-location balances"
          description="Internal ledger positions compared with the most recent external snapshot."
          padded={false}
        >
          {loading ? (
            <div className="p-6 text-sm text-slate-500">
              Loading treasury balances…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">
                      Account
                    </th>
                    <th className="px-4 py-2 text-left">
                      Provider
                    </th>
                    <th className="px-4 py-2 text-right">
                      Internal
                    </th>
                    <th className="px-4 py-2 text-right">
                      External
                    </th>
                    <th className="px-4 py-2 text-right">
                      Variance
                    </th>
                    <th className="px-4 py-2 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(overview?.accounts ??
                    []).map(
                    (account) => {
                      const variance =
                        minorToNaira(
                          account.latestVarianceMinor,
                        );

                      return (
                        <tr
                          key={
                            account.treasuryAccountId
                          }
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#0B1220]">
                              {
                                account.name
                              }
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {
                                account.code
                              }
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {
                              account.provider
                            }
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">
                            {formatNaira(
                              minorToNaira(
                                account.internalBalanceMinor,
                              ),
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">
                            {account.latestExternalBalanceMinor
                              ? formatNaira(
                                  minorToNaira(
                                    account.latestExternalBalanceMinor,
                                  ),
                                )
                              : '—'}
                          </td>
                          <td
                            className={
                              variance ===
                              0
                                ? 'px-4 py-3 text-right font-bold text-emerald-700'
                                : 'px-4 py-3 text-right font-bold text-red-700'
                            }
                          >
                            {account.latestVarianceMinor
                              ? formatNaira(
                                  variance,
                                )
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {account.kind ===
                              'PAYOUT_WALLET' &&
                            account.provider !==
                              'BANK' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  snapshot(
                                    account.provider as Provider,
                                  )
                                }
                                disabled={
                                  busy !==
                                  null
                                }
                                className="text-xs font-black uppercase tracking-[0.12em] text-navy-700 disabled:opacity-50"
                              >
                                Snapshot
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Manual
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Primary bank snapshot"
          description="Record the current bank balance after checking the actual bank statement or banking portal."
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-bold text-slate-600">
              Balance (NGN)
              <input
                type="number"
                min="0"
                step="0.01"
                value={bankBalance}
                onChange={(e) =>
                  setBankBalance(
                    e.target.value,
                  )
                }
                placeholder="0"
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </label>

            <label className="text-xs font-bold text-slate-600">
              Statement/reference
              <input
                value={bankReference}
                onChange={(e) =>
                  setBankReference(
                    e.target.value,
                  )
                }
                placeholder="Optional statement reference"
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={recordBank}
              disabled={
                busy !== null
              }
              className="mt-auto h-10 rounded-md bg-amber-500 px-4 text-sm font-black text-navy-950 disabled:opacity-50"
            >
              Record snapshot
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Open exceptions"
          description="Nothing here should be silently edited into agreement. Resolve only after Finance verifies the underlying provider or bank evidence."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">
                    Severity
                  </th>
                  <th className="px-4 py-2 text-left">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left">
                    Provider
                  </th>
                  <th className="px-4 py-2 text-left">
                    Reference
                  </th>
                  <th className="px-4 py-2 text-right">
                    Variance
                  </th>
                  <th className="px-4 py-2 text-right">
                    Review
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No open reconciliation exceptions.
                    </td>
                  </tr>
                ) : (
                  issues.map(
                    (issue) => (
                      <tr
                        key={
                          issue.issueId
                        }
                      >
                        <td className="px-4 py-3">
                          <StatusPill
                            tone={
                              issue.severity ===
                              'CRITICAL'
                                ? 'danger'
                                : issue.severity ===
                                    'WARNING'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {
                              issue.severity
                            }
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 font-bold">
                          {issue.type}
                        </td>
                        <td className="px-4 py-3">
                          {issue.provider ??
                            '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {issue.internalReference ??
                            issue.externalReference ??
                            '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {issue.varianceMinor
                            ? formatNaira(
                                minorToNaira(
                                  issue.varianceMinor,
                                ),
                              )
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              disabled={
                                busy ===
                                `issue-${issue.issueId}`
                              }
                              onClick={() =>
                                resolveIssue(
                                  issue.issueId,
                                  'RESOLVED',
                                )
                              }
                              className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700 disabled:opacity-50"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              disabled={
                                busy ===
                                `issue-${issue.issueId}`
                              }
                              onClick={() =>
                                resolveIssue(
                                  issue.issueId,
                                  'IGNORED',
                                )
                              }
                              className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 disabled:opacity-50"
                            >
                              Ignore
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-2">
          <SectionCard
            title="Recent settlement batches"
            description="Provider batches already pulled into SureWina."
            padded={false}
          >
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {settlements
                    .slice(
                      0,
                      20,
                    )
                    .map(
                      (row) => (
                        <tr
                          key={
                            row.settlementId
                          }
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold">
                              {
                                row.provider
                              }
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {
                                row.providerSettlementId
                              }
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              tone={statusToTone(
                                row.status,
                              )}
                            >
                              {
                                row.status
                              }
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-bold">
                              {formatNaira(
                                minorToNaira(
                                  row.netAmountMinor,
                                ),
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {row.lines}{' '}
                              transactions
                            </p>
                          </td>
                        </tr>
                      ),
                    )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Recent reconciliation runs"
            description="Audit trail of transaction and balance checks."
            padded={false}
          >
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {runs
                    .slice(
                      0,
                      20,
                    )
                    .map(
                      (run) => (
                        <tr
                          key={
                            run.runId
                          }
                        >
                          <td className="px-4 py-3">
                            <p className="font-bold">
                              {run.provider ??
                                'BANK'}{' '}
                              {
                                run.runType
                              }
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {new Date(
                                run.startedAt,
                              ).toLocaleString(
                                'en-NG',
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              tone={statusToTone(
                                run.status,
                              )}
                            >
                              {
                                run.status
                              }
                            </StatusPill>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-bold">
                              {
                                run.issueCount
                              }{' '}
                              issues
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {
                                run.recordsMatched
                              }
                              /
                              {
                                run.recordsScanned
                              }{' '}
                              matched
                            </p>
                          </td>
                        </tr>
                      ),
                    )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() =>
              void load()
            }
            disabled={
              busy !== null
            }
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-black text-navy-700 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon:
    | typeof Wallet
    | typeof Banknote
    | typeof Scale;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div
          className={
            danger
              ? 'flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-700'
              : 'flex h-9 w-9 items-center justify-center rounded-md bg-navy-50 text-navy-700'
          }
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black text-[#0B1220]">
        {value}
      </p>
    </div>
  );
}
