'use client';

import { FormEvent, useEffect, useState } from 'react';
import { RotateCcw, Search, Ticket as TicketIcon, Trophy } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminPaymentRow, AdminTicketSearchRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const PAYMENT_FILTERS = ['', 'CONFIRMED', 'PENDING', 'FAILED', 'REFUNDED'];

export default function TicketsPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [tab, setTab] = useState<'tickets' | 'payments'>('tickets');

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Tickets & payments"
        description="Look up any ticket by reference or phone, and browse payment transactions."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Tickets' }]}
        rightSlot={
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
            {(['tickets', 'payments'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  tab === t
                    ? 'rounded-sm bg-[#0B1220] px-4 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
                    : 'rounded-sm px-4 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500'
                }
              >
                {t === 'tickets' ? 'Ticket search' : 'Payments'}
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {tab === 'tickets' ? <TicketSearch /> : <PaymentBrowser session={session} />}
      </div>
    </>
  );
}

function TicketSearch() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminTicketSearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (term.length < 4) {
      setError('Enter at least 4 characters — a ticket ref (SW-…) or phone digits.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.admin.searchTickets(term);
      setRows(res.tickets);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SW-3XJH-4AKN or 9039070031"
            className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 font-mono text-sm outline-none focus:border-navy-700"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[#0B1220] px-5 py-2 text-sm font-black text-white disabled:bg-slate-300"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {rows !== null && (
        <SectionCard
          title={`${rows.length} ticket${rows.length === 1 ? '' : 's'}`}
          padded={false}
        >
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Ticket</th>
                <th className="px-4 py-2 text-left">Draw</th>
                <th className="px-4 py-2 text-left">Buyer</th>
                <th className="px-4 py-2 text-left">Channel</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2 text-left">Payment</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    Nothing found for that reference or phone.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.ticketRef}>
                    <td className="px-4 py-2">
                      <p className="flex items-center gap-1.5 font-mono text-xs font-black text-[#0B1220]">
                        {t.isWinner && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                        {t.ticketRef}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(t.createdAt).toLocaleString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-mono text-xs">{t.drawCode}</p>
                      <p className="max-w-[160px] truncate text-[10px] text-slate-500">
                        {t.prizeDescription}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-mono text-xs">{t.buyerPhone}</p>
                      <p className="text-[10px] text-slate-500">{t.stateOfPlayCode}</p>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {t.channel}
                      {t.agentCode && (
                        <p className="font-mono text-[10px] text-slate-500">{t.agentCode}</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNaira(t.faceValueNgn)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill tone={statusToTone(t.payment.status)}>
                        {t.payment.gateway}
                      </StatusPill>
                      <p
                        className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-slate-500"
                        title={t.payment.gatewayReference}
                      >
                        {t.payment.gatewayReference}
                      </p>
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill tone={statusToTone(t.status)}>{t.status}</StatusPill>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SectionCard>
      )}
    </>
  );
}

function PaymentBrowser({ session }: { session: AdminSession }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .listPayments({ status: status || undefined })
      .then((res) => setRows(res.payments))
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not load payments.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const refund = async (txnId: string) => {
    if (reason.trim().length < 4) return;
    setBusy(true);
    try {
      await api.admin.refundPayment(txnId, reason.trim());
      setRefunding(null);
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed — note it requires finance role.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={
              status === f
                ? 'rounded-sm bg-[#0B1220] px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-white'
                : 'rounded-sm px-3 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500 hover:bg-slate-50'
            }
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      ) : (
        <SectionCard title={`${rows.length} recent payment${rows.length === 1 ? '' : 's'}`} padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Buyer</th>
                <th className="px-4 py-2 text-left">Gateway</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Tickets</th>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No payments in this state.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.txnId}>
                    <td className="max-w-[160px] truncate px-4 py-2 font-mono text-xs" title={p.gatewayReference}>
                      {p.gatewayReference}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{p.buyerPhone}</td>
                    <td className="px-4 py-2 text-xs">{p.gateway}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">
                      {formatNaira(p.amountNgn)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.ticketCount}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(p.createdAt).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill tone={statusToTone(p.status)}>{p.status}</StatusPill>
                      {p.failureReason && (
                        <p className="mt-0.5 max-w-[140px] truncate text-[10px] text-red-600" title={p.failureReason}>
                          {p.failureReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.status === 'CONFIRMED' ? (
                        refunding === p.txnId ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Refund reason…"
                              className="h-8 w-44 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-navy-700"
                            />
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={busy || reason.trim().length < 4}
                                onClick={() => refund(p.txnId)}
                                className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase text-white disabled:bg-slate-300"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setRefunding(null)}
                                className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <GuardedActionButton
                            session={session}
                            action="CHANGE_TICKET_PRICE"
                            icon={<RotateCcw className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setRefunding(p.txnId);
                              setReason('');
                            }}
                            className="rounded-md border-red-200 bg-red-50 text-red-700"
                          >
                            Refund
                          </GuardedActionButton>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SectionCard>
      )}
    </>
  );
}