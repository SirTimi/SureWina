'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Banknote,
  Clock,
  Gauge,
  Receipt,
  ShieldCheck,
  Ticket,
  Trophy,
  UserCog,
} from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import type { AdminDashboard } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';
import {
  type AdminPermission,
  type AdminSession,
  hasPermission,
  roleDescription,
  roleLabel,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

export default function DashboardPage() {
  return (
    <AdminShell>
      {(session) => <DashboardBody session={session} />}
    </AdminShell>
  );
}

function DashboardBody({ session }: { session: AdminSession }) {
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .dashboard()
      .then(setDash)
      .catch(() => setDash(null))
      .finally(() => setLoading(false));
  }, []);

  // Still mock — these become real in later Stage E steps (draws, tickets, audit).
  const todaysDraws = useMemo(() => adminMock.getTodaysDraws(), []);
  const failedPayments = useMemo(() => adminMock.getFailedPayments(), []);
  const [chain, setChain] = useState(() => adminMock.getAuditorChain());

  useEffect(() => {
    const id = setInterval(() => setChain(adminMock.getAuditorChain()), 1000);
    return () => clearInterval(id);
  }, []);

  const can = (permission: AdminPermission) => hasPermission(session.tier, permission);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  const ticketsToday = dash ? dash.today.direct.tickets + dash.today.agent.tickets : 0;

  const visibleKpis = [
    can('VIEW_TICKETS') && (
      <KpiTile
        key="tickets"
        icon={Ticket}
        label="Tickets today"
        value={ticketsToday.toLocaleString('en-NG')}
        hint={`${dash?.today.direct.tickets ?? 0} direct · ${dash?.today.agent.tickets ?? 0} agent`}
      />
    ),
    can('VIEW_FINANCE') && (
      <KpiTile
        key="revenue"
        icon={Receipt}
        label="Sales today"
        value={formatNaira(dash?.today.totalSalesNgn ?? 0)}
        hint={`${(dash?.today.direct.transactions ?? 0) + (dash?.today.agent.transactions ?? 0)} transactions`}
      />
    ),
    can('VIEW_FINANCE') && (
      <KpiTile
        key="remittance"
        icon={Banknote}
        label="Remittance owed"
        value={formatNaira(dash?.remittance.outstandingNgn ?? 0)}
        tone={(dash?.remittance.outstandingNgn ?? 0) > 0 ? 'warning' : 'success'}
        hint={`${dash?.remittance.openCount ?? 0} open periods`}
      />
    ),
    can('VIEW_FINANCE') && (
      <KpiTile
        key="commission"
        icon={Gauge}
        label="Commission pending"
        value={formatNaira(dash?.commission.pendingNgn ?? 0)}
        hint={`${dash?.commission.pendingCount ?? 0} disbursements`}
      />
    ),
    can('REVIEW_KYC') && (
      <KpiTile
        key="kyc"
        icon={ShieldCheck}
        label="KYC awaiting review"
        value={String(dash?.actionRequired.kycPendingReview ?? 0)}
        tone={(dash?.actionRequired.kycPendingReview ?? 0) > 0 ? 'warning' : 'success'}
        hint="Should be zero at day end"
      />
    ),
    can('VIEW_DRAWS') && (
      <KpiTile
        key="draws"
        icon={Clock}
        label="Active draws"
        value={String(dash?.actionRequired.activeDraws ?? 0)}
        hint="Currently selling"
      />
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow={`${roleLabel(session.tier)} dashboard`}
        title="Role-based view"
        description={roleDescription(session.tier)}
        rightSlot={
          can('INITIATE_DRAW_SETUP') ? (
            <Link
              href="/draws/new"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
            >
              <Trophy className="h-4 w-4" />
              New draw
            </Link>
          ) : null
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{visibleKpis}</div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          {can('VIEW_DRAWS') && (
            <SectionCard
              title="Today's draws"
              description="Open and scheduled draws for today, with live ticket counts."
              rightSlot={
                <Link href="/draws" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                  Open list →
                </Link>
              }
              padded={false}
            >
              <table className="min-w-full text-sm">
                <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Draw</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-right">Sold / cap</th>
                    <th className="px-4 py-2 text-right">Cutoff</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysDraws.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        No draws scheduled for today.
                      </td>
                    </tr>
                  ) : (
                    todaysDraws.map((d) => {
                      const pct = Math.min(100, (d.ticketsSold / d.ticketCap) * 100);
                      return (
                        <tr key={d.drawCode}>
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#0B1220]">{d.prizeDescription}</p>
                            <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="font-display text-sm font-black tabular-nums">
                              {d.ticketsSold.toLocaleString('en-NG')} / {d.ticketCap.toLocaleString('en-NG')}
                            </p>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">
                            {new Date(d.cutoffAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/draws/${d.drawCode}`} className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </SectionCard>
          )}

          {can('VIEW_AUDIT_LOGS') && (
            <SectionCard title="Auditor chain" description="Signed ticket counter — last few seconds. Anchored to RNG seed hash." padded={false}>
              <div className="thin-scrollbar max-h-[330px] overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">At</th>
                      <th className="px-3 py-2 text-right">Tickets</th>
                      <th className="px-3 py-2 text-left">Signature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chain.map((c, i) => (
                      <tr key={i} className={i === 0 ? 'bg-amber-50' : ''}>
                        <td className="px-3 py-2 font-mono">
                          {new Date(c.at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{c.tickets.toLocaleString('en-NG')}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{c.signature}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>

        {can('VIEW_TICKETS') && (
          <SectionCard
            title="Failed payments"
            description={`${failedPayments.length} declined in the last hour. Investigate before they retry through agents.`}
            padded={false}
            rightSlot={
              <Link href="/tickets?status=FAILED" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                Open all
              </Link>
            }
          >
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {failedPayments.map((p) => (
                  <tr key={p.paymentId}>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(p.at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{p.customerPhoneE164}</td>
                    <td className="px-4 py-2 text-xs">{p.channel}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatNaira(p.amountNgn)}</td>
                    <td className="px-4 py-2">
                      <StatusPill tone="danger" icon={<AlertOctagon className="h-3 w-3" />}>
                        {p.reason}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {can('VIEW_AGENTS') && <QuickLink href="/agents" icon={UserCog} label="Manage agents" />}
          {can('VIEW_CLAIMS') && <QuickLink href="/claims" icon={Trophy} label="Claims pipeline" />}
          {can('VIEW_PAYOUTS') && <QuickLink href="/payouts" icon={Banknote} label="Approve payouts" />}
          {can('VIEW_REPORTS') && <QuickLink href="/reports" icon={ShieldCheck} label="Compliance reports" />}
        </div>
      </div>
    </>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Trophy; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-[#0B1220] shadow-sm transition hover:border-navy-200 hover:bg-navy-50">
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy-700">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </span>
      <span className="text-xs text-navy-700">→</span>
    </Link>
  );
}