'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import type {
  AdminClaimRow,
  AdminDailyReport,
  AdminDashboard,
  AdminDrawRow,
  AdminPaymentRow,
  AdminRemittanceRow,
  AdminSeedRow,
} from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
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

// Function drives content: each department lands on its own working view.
// Tier still drives permissions inside each view.
function DashboardBody({ session }: { session: AdminSession }) {
  if (session.role === 'COMPLIANCE_OFFICER') return <ComplianceDashboard session={session} />;
  if (session.role === 'FINANCE_OFFICER') return <FinanceDashboard session={session} />;
  return <OperatorDashboard session={session} />;
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function isTodayLocal(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/* ───────────────────────── Operator ───────────────────────── */

function OperatorDashboard({ session }: { session: AdminSession }) {
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .dashboard()
      .then(setDash)
      .catch(() => setDash(null))
      .finally(() => setLoading(false));
  }, []);

  // Real: today's draws from the admin list.
  const [todaysDraws, setTodaysDraws] = useState<AdminDrawRow[]>([]);
  useEffect(() => {
    api.admin
      .listDraws()
      .then((res) =>
        setTodaysDraws(
          res.draws.filter(
            (d) =>
              isTodayLocal(d.scheduledAt) &&
              (d.status === 'SCHEDULED' || d.status === 'ACTIVE' || d.status === 'SALES_CLOSED'),
          ),
        ),
      )
      .catch(() => setTodaysDraws([]));
  }, []);

  // Real: recent failed payments.
  const [failedPayments, setFailedPayments] = useState<AdminPaymentRow[]>([]);
  useEffect(() => {
    api.admin
      .listPayments({ status: 'FAILED' })
      .then((res) => setFailedPayments(res.payments.slice(0, 6)))
      .catch(() => setFailedPayments([]));
  }, []);

  // Real: latest RNG seed commitments from the registry.
  const [seedFeed, setSeedFeed] = useState<AdminSeedRow[]>([]);
  useEffect(() => {
    api.admin
      .seedRegistry()
      .then((res) => setSeedFeed(res.seeds.slice(0, 8)))
      .catch(() => setSeedFeed([]));
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
              description="Open and scheduled draws for today, with ticket counts."
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
                    <th className="px-4 py-2 text-right">Sold</th>
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
                    todaysDraws.map((d) => (
                      <tr key={d.drawId}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-[#0B1220]">{d.prizeDescription}</p>
                          <p className="font-mono text-xs text-slate-500">{d.drawCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill tone={statusToTone(d.status)}>{d.status}</StatusPill>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-display text-sm font-black tabular-nums">
                            {d.ticketsSold.toLocaleString('en-NG')}
                            {d.ticketQuota ? ` / ${d.ticketQuota.toLocaleString('en-NG')}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {new Date(d.cutoffAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/draws/${d.drawId}`} className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </SectionCard>
          )}

          {can('VIEW_AUDIT_LOGS') && (
            <SectionCard
              title="Seed commitments"
              description="Latest RNG commitments and their reveal state."
              padded={false}
              rightSlot={
                <Link href="/rng-seeds" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                  Registry →
                </Link>
              }
            >
              <div className="thin-scrollbar max-h-[330px] overflow-y-auto">
                <table className="min-w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {seedFeed.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-sm text-slate-500">
                          No seed commitments yet.
                        </td>
                      </tr>
                    ) : (
                      seedFeed.map((s) => (
                        <tr key={s.drawId}>
                          <td className="px-3 py-2 font-mono text-[10px] font-black text-navy-700">
                            {s.drawCode}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[10px] text-slate-500">
                            {s.committedHash.slice(0, 16)}…
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!s.revealed ? (
                              <span className="text-[10px] font-black uppercase text-slate-400">
                                Sealed
                              </span>
                            ) : s.revealMatches ? (
                              <span className="text-[10px] font-black uppercase text-emerald-600">
                                Verified
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-red-600">
                                MISMATCH
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>

        {can('VIEW_TICKETS') && (
          <SectionCard
            title="Failed payments"
            description={`${failedPayments.length} recent failed payment${failedPayments.length === 1 ? '' : 's'}.`}
            padded={false}
            rightSlot={
              <Link href="/tickets" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                Open all
              </Link>
            }
          >
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Gateway</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {failedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                      No failed payments — all clear.
                    </td>
                  </tr>
                ) : (
                  failedPayments.map((p) => (
                    <tr key={p.txnId}>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(p.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{p.buyerPhone}</td>
                      <td className="px-4 py-2 text-xs">{p.gateway}</td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">{formatNaira(p.amountNgn)}</td>
                      <td className="px-4 py-2">
                        <StatusPill tone="danger" icon={<AlertOctagon className="h-3 w-3" />}>
                          {p.failureReason ?? 'Failed'}
                        </StatusPill>
                      </td>
                    </tr>
                  ))
                )}
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

/* ─────────────────────── Compliance ───────────────────────── */

function ComplianceDashboard({ session }: { session: AdminSession }) {
  const [claims, setClaims] = useState<AdminClaimRow[]>([]);
  const [report, setReport] = useState<AdminDailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.admin.listClaims('KYC_PENDING'),
      api.admin.dailyReport(new Date().toISOString().slice(0, 10)),
    ])
      .then(([c, r]) => {
        if (c.status === 'fulfilled') setClaims(c.value.claims);
        if (r.status === 'fulfilled') setReport(r.value);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Compliance dashboard"
        title={`Good ${greetingWord()}, ${session.fullName.split(' ')[0]}`}
        description="KYC queue, today's draw integrity, and statutory reporting."
      />
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            icon={ShieldCheck}
            label="KYC awaiting review"
            value={String(claims.length)}
            tone={claims.length > 0 ? 'warning' : 'success'}
            hint="Should be zero at day end"
          />
          <KpiTile
            icon={Trophy}
            label="Draws executed today"
            value={String(report?.draws.length ?? 0)}
            hint="With integrity artefacts"
          />
          <KpiTile
            icon={Receipt}
            label="WHT withheld today"
            value={formatNaira(report?.totalWhtWithheldNgn ?? 0)}
            hint="For onward remittance"
          />
          <KpiTile
            icon={AlertOctagon}
            label="Claims forfeited today"
            value={String(report?.claimsForfeited ?? 0)}
          />
        </div>

        {claims.length > 0 && (
          <SectionCard
            title="Oldest awaiting review"
            description="First in, first reviewed."
            padded={false}
            rightSlot={
              <Link href="/claims" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                Open queue →
              </Link>
            }
          >
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {claims.slice(0, 5).map((c) => (
                  <tr key={c.claimId}>
                    <td className="px-4 py-2 font-mono text-xs">{c.winnerTicketRef}</td>
                    <td className="px-4 py-2 text-xs">{c.winnerPhone}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(c.netPrizeValueNgn)}</td>
                    <td className="px-4 py-2 text-right text-xs text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/claims" icon={Trophy} label="KYC review queue" />
          <QuickLink href="/reports" icon={ShieldCheck} label="Daily NLRC report" />
          <QuickLink href="/reports/levy" icon={Receipt} label="State levy" />
          <QuickLink href="/audit-log" icon={Gauge} label="Audit log" />
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Finance ────────────────────────── */

function FinanceDashboard({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<AdminRemittanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .listRemittances()
      .then((res) => setRows(res.remittances))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  const outstanding = rows
    .filter((r) => r.status !== 'RECEIVED' && r.status !== 'WRITTEN_OFF')
    .reduce((s, r) => s + r.amountDueNgn, 0);
  const awaiting = rows.filter((r) => r.status === 'AGENT_CONFIRMED');
  const late = rows.filter((r) => r.status === 'LATE').length;

  return (
    <>
      <PageHeader
        eyebrow="Finance dashboard"
        title={`Good ${greetingWord()}, ${session.fullName.split(' ')[0]}`}
        description="Remittances awaiting verification, outstanding balances, and money movement."
      />
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            icon={Banknote}
            label="Outstanding remittance"
            value={formatNaira(outstanding)}
            tone={outstanding > 0 ? 'warning' : 'success'}
          />
          <KpiTile
            icon={Clock}
            label="Awaiting your verification"
            value={String(awaiting.length)}
            tone={awaiting.length > 0 ? 'warning' : 'success'}
            hint="Agent-confirmed transfers"
          />
          <KpiTile
            icon={AlertOctagon}
            label="Late periods"
            value={String(late)}
            tone={late > 0 ? 'danger' : 'success'}
          />
          <KpiTile icon={Receipt} label="Open periods shown" value={String(rows.length)} />
        </div>

        {awaiting.length > 0 && (
          <SectionCard
            title="Verify these transfers"
            description="Agents say the money has been sent — confirm receipt to release their commission."
            padded={false}
            rightSlot={
              <Link href="/remittance" className="text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                Open remittances →
              </Link>
            }
          >
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {awaiting.slice(0, 5).map((r) => (
                  <tr key={r.remittanceId}>
                    <td className="px-4 py-2 font-bold">{r.agentName}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.periodDate}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.bankTransferRef ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatNaira(r.amountDueNgn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/remittance" icon={Banknote} label="Remittances" />
          <QuickLink href="/reports/sales" icon={Receipt} label="Sales review" />
          <QuickLink href="/reports/financial" icon={Gauge} label="Operating P&L" />
          <QuickLink href="/reports/agents" icon={UserCog} label="Agent performance" />
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