'use client';
import type { AdminSession } from '@/lib/admin-auth';
import {
  CalendarClock,
  Clock,
  Coins,
  FileClock,
  GitPullRequestArrow,
  ShieldAlert,
  TimerReset,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  drawScheduleTypeLabel,
  getDrawFormulaVersions,
  getDrawScheduleRules,
  getTicketPriceVersions,
  scheduleStatusTone,
} from '@/lib/draw-schedule-mock';

export default function DrawScheduleSettingsPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  const schedules = getDrawScheduleRules();
  const priceVersions = getTicketPriceVersions();
  const formulaVersions = getDrawFormulaVersions();

  return (
    <>
      <PageHeader
        eyebrow="Draws · Schedule configuration"
        title="Draw schedule settings"
        description="Configure recurring draw rules, cutoff time, execution time, effective dates, and versioned pricing."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: 'Schedule config' },
        ]}
        rightSlot={
          <GuardedActionButton
            session={session}
            action="CREATE_DRAW_SETUP_REQUEST"
            variant="accent"
            className="rounded-md font-black"
            icon={<GitPullRequestArrow className="h-4 w-4" />}
          >
            Request schedule change
          </GuardedActionButton>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This is frontend-only configuration modeling. Schedule changes, ticket price
              changes, and draw formula changes should create approval requests before they
              become active.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard
            icon={<CalendarClock className="h-5 w-5" />}
            label="Recurring schedules"
            value={schedules.length.toLocaleString('en-NG')}
          />
          <SummaryCard
            icon={<Clock className="h-5 w-5" />}
            label="Default cutoff rule"
            value="1hr before draw"
            tone="info"
          />
          <SummaryCard
            icon={<TimerReset className="h-5 w-5" />}
            label="Reopen delay"
            value="1hr after draw"
            tone="warning"
          />
          <SummaryCard
            icon={<Coins className="h-5 w-5" />}
            label="Price versions"
            value={priceVersions.length.toLocaleString('en-NG')}
            tone="success"
          />
        </div>

        <SectionCard
          title="Recurring draw schedules"
          description="Draw setup is separated from schedule rules. These rules define when tickets open, close, execute, and reopen."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Schedule</th>
                  <th className="px-4 py-2 text-left">Recurrence</th>
                  <th className="px-4 py-2 text-right">Sale start</th>
                  <th className="px-4 py-2 text-right">Cutoff</th>
                  <th className="px-4 py-2 text-right">Execution</th>
                  <th className="px-4 py-2 text-right">Reopen delay</th>
                  <th className="px-4 py-2 text-left">Effective</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {schedules.map((schedule) => (
                  <tr key={schedule.scheduleId}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0B1220]">{schedule.drawName}</p>
                      <p className="text-xs text-slate-500">
                        {drawScheduleTypeLabel(schedule.scheduleType)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {schedule.recurrence}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-black">
                      {schedule.ticketSaleStartTime}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-black">
                      {schedule.cutoffTime}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-black">
                      {schedule.drawExecutionTime}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                      {schedule.reopenDelayMinutes} mins
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {schedule.effectiveFrom}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={scheduleStatusTone(schedule.status)}>
                        {schedule.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <SectionCard
            title="Effective-date configuration"
            description="New rules should not overwrite old rules. They should become active from a future effective date after approval."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Change type">
                <select className={inputClass}>
                  <option>Schedule rule change</option>
                  <option>Ticket price version</option>
                  <option>Draw formula/config change</option>
                </select>
              </Field>

              <Field label="Effective date">
                <input type="date" className={inputClass} defaultValue="2026-06-15" />
              </Field>

              <Field label="Ticket sale start time">
                <input type="time" className={inputClass} defaultValue="21:00" />
              </Field>

              <Field label="Cutoff time">
                <input type="time" className={inputClass} defaultValue="19:00" />
              </Field>

              <Field label="Draw execution time">
                <input type="time" className={inputClass} defaultValue="20:00" />
              </Field>

              <Field label="Processing/reopen delay">
                <select className={inputClass} defaultValue="60">
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
              </Field>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Default operational assumption
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Cutoff time is treated as the point where ticket sales stop. The default
                model is cutoff 1 hour before draw execution, then reopening 1 hour after
                draw processing completes.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <GuardedActionButton
                session={session}
                action="CREATE_DRAW_SETUP_REQUEST"
                variant="accent"
                className="rounded-md font-black"
                icon={<GitPullRequestArrow className="h-4 w-4" />}
              >
                Create approval request
              </GuardedActionButton>

              <Button
                type="button"
                variant="secondary"
                className="rounded-md border-slate-200 bg-white text-[#0B1220]"
              >
                Save as draft
              </Button>
            </div>
          </SectionCard>

          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
              <FileClock className="h-6 w-6" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Approval routing
            </p>

            <h3 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">
              Sensitive changes require approval
            </h3>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              <ApprovalRule title="Schedule rule changes">
                Intermediate Admin can create the setup request. Super Admin gives final approval.
              </ApprovalRule>

              <ApprovalRule title="Ticket price changes">
                Price changes are versioned and should not overwrite existing ticket records.
              </ApprovalRule>

              <ApprovalRule title="Draw formula changes">
                Formula/config changes must pass through approval before becoming active.
              </ApprovalRule>
            </div>
          </Card>
        </div>

        <SectionCard
          title="Ticket price versions"
          description="Price changes are versioned. Existing tickets keep the price/version they were sold under."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket type</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-left">Effective from</th>
                  <th className="px-4 py-2 text-left">Effective to</th>
                  <th className="px-4 py-2 text-left">Created by</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {priceVersions.map((version) => (
                  <tr key={version.versionId}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0B1220]">{version.label}</p>
                      <p className="font-mono text-xs text-slate-400">{version.versionId}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {formatNaira(version.priceNgn)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {version.effectiveFrom}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {version.effectiveTo ?? 'Current'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {version.createdBy}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={scheduleStatusTone(version.status)}>
                        {version.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Draw formula/config versions"
          description="Formula/config changes are versioned and require approval before becoming active."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Version</th>
                  <th className="px-4 py-2 text-left">Summary</th>
                  <th className="px-4 py-2 text-left">Effective from</th>
                  <th className="px-4 py-2 text-left">Created by</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {formulaVersions.map((version) => (
                  <tr key={version.versionId}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#0B1220]">{version.label}</p>
                      <p className="font-mono text-xs text-slate-400">{version.versionId}</p>
                    </td>
                    <td className="px-4 py-3 text-sm leading-relaxed text-slate-600">
                      {version.formulaSummary}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {version.effectiveFrom}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {version.createdBy}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={scheduleStatusTone(version.status)}>
                        {version.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-[#0B1220]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ApprovalRule({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="font-bold text-[#0B1220]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{children}</p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'info';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}