'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Ban, PlayCircle, Search, ShieldAlert, Ticket, Trophy, Wallet } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminCustomerDetail } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

export default function CustomersPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = phone.trim();
    if (!q) return;
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const res = await api.admin.customerDetail(q);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const block = async () => {
    if (!data || reason.trim().length < 4) return;
    setBusy(true);
    try {
      await api.admin.blockCustomer(data.phoneNumber, reason.trim());
      setBlockOpen(false);
      setReason('');
      await lookup();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Block failed.');
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.admin.unblockCustomer(data.phoneNumber);
      await lookup();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unblock failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Customer lookup"
        description="Customers are looked up by phone number — the platform does not expose a browsable customer list."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Customers' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <form onSubmit={lookup} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2349039070031"
              className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 font-mono text-sm outline-none focus:border-navy-700"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-[#0B1220] px-5 py-2 text-sm font-black text-white disabled:bg-slate-300"
          >
            {loading ? 'Searching…' : 'Look up'}
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="font-mono text-lg font-black text-[#0B1220]">{data.phoneNumber}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.displayName ?? 'No display name'} ·{' '}
                  {data.registered ? 'Registered account' : 'Guest purchaser (no account)'}
                  {data.kycStatus ? ` · KYC ${data.kycStatus}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {data.blocked ? (
                  <>
                    <StatusPill tone="danger" icon={<ShieldAlert className="h-3 w-3" />}>
                      Blocked
                    </StatusPill>
                    <GuardedActionButton
                      session={session}
                      action="SUSPEND_ADMIN"
                      icon={<PlayCircle className="h-4 w-4" />}
                      onClick={unblock}
                      className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {busy ? 'Working…' : 'Unblock'}
                    </GuardedActionButton>
                  </>
                ) : (
                  <GuardedActionButton
                    session={session}
                    action="SUSPEND_ADMIN"
                    icon={<Ban className="h-4 w-4" />}
                    onClick={() => setBlockOpen(true)}
                    className="rounded-md border-red-200 bg-red-50 text-red-700"
                  >
                    Block purchases
                  </GuardedActionButton>
                )}
              </div>
            </div>

            {data.blocked && data.blockReason && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <span className="font-black">Block reason:</span> {data.blockReason}
              </div>
            )}

            {blockOpen && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-[#0B1220]">Block this number from purchasing</p>
                <p className="mt-1 text-xs text-slate-600">
                  Recorded in the audit log. The customer will be refused at every purchase door.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Reason (e.g. suspected fraud, self-exclusion request, regulator instruction)…"
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-700"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || reason.trim().length < 4}
                    onClick={block}
                    className="rounded-md bg-[#0B1220] px-4 py-2 text-sm font-black text-white disabled:bg-slate-300"
                  >
                    {busy ? 'Blocking…' : 'Confirm block'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBlockOpen(false);
                      setReason('');
                    }}
                    className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={Wallet} label="Lifetime spend">{formatNaira(data.lifetime.spendNgn)}</Stat>
              <Stat icon={Ticket} label="Tickets bought">
                {data.lifetime.ticketsBought.toLocaleString('en-NG')}
              </Stat>
              <Stat icon={Wallet} label="Transactions">
                {data.lifetime.transactions.toLocaleString('en-NG')}
              </Stat>
              <Stat icon={Trophy} label="Jackpot entries">
                {data.accumulation?.jackpotEntriesTotal ?? 0}
              </Stat>
            </div>

            <SectionCard
              title="Claims"
              description={`${data.claims.length} claim${data.claims.length === 1 ? '' : 's'} on this number.`}
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Ticket</th>
                    <th className="px-4 py-2 text-right">Prize</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Won</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.claims.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No claims for this customer.
                      </td>
                    </tr>
                  ) : (
                    data.claims.map((c) => (
                      <tr key={c.claimId}>
                        <td className="px-4 py-2 font-mono text-xs">{c.winnerTicketRef}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNaira(c.grossPrizeValueNgn)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill tone={statusToTone(c.status)}>{c.status}</StatusPill>
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500">
                          {new Date(c.createdAt).toLocaleDateString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/claims/${c.claimId}`}
                            className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>
          </>
        )}
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Wallet;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-display text-lg font-black text-[#0B1220]">{children}</p>
    </div>
  );
}