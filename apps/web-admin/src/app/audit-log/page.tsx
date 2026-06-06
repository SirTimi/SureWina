'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, Search, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { roleLabel } from '@/lib/admin-auth';
import {
  auditActionLabel,
  auditModuleLabel,
  auditSeverityTone,
  listAuditLogs,
  type AuditAction,
  type AuditLogEntry,
  type AuditModule,
} from '@/lib/audit-log-mock';

const moduleOptions: Array<'ALL' | AuditModule> = [
  'ALL',
  'ADMINS',
  'AGENTS',
  'DRAWS',
  'WORKFLOWS',
  'PAYOUTS',
  'CONFIG',
  'AUTH',
  'REPORTS',
];

const actionOptions: Array<'ALL' | AuditAction> = [
  'ALL',
  'ADMIN_CREATED',
  'ADMIN_APPROVED',
  'ADMIN_REJECTED',
  'ADMIN_SUSPENDED',
  'ADMIN_REVOKED',
  'ROLE_CHANGED',
  'AGENT_PROFILED',
  'AGENT_APPROVED',
  'DRAW_CREATED',
  'DRAW_CONFIG_CHANGED',
  'TICKET_PRICE_CHANGED',
  'PAYOUT_APPROVED',
  'WORKFLOW_APPROVED',
  'WORKFLOW_REJECTED',
  'LOGIN',
  'VIEWED_AUDIT_LOG',
  'CONFIG_CHANGE_REQUESTED',
];

export default function AuditLogPage() {
  return (
    <AdminShell>
      {(session) => <Body actorName={session.fullName} actorRoleLabel={roleLabel(session.role)} />}
    </AdminShell>
  );
}

function Body({
  actorName,
  actorRoleLabel,
}: {
  actorName: string;
  actorRoleLabel: string;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [module, setModule] = useState<'ALL' | AuditModule>('ALL');
  const [action, setAction] = useState<'ALL' | AuditAction>('ALL');
  const [date, setDate] = useState('');

  const refresh = () => setEntries(listAuditLogs());

  useEffect(() => {
    refresh();

    window.addEventListener('surewina:audit-log-changed', refresh);
    return () => {
      window.removeEventListener('surewina:audit-log-changed', refresh);
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesQuery =
        !normalizedQuery ||
        entry.actorName.toLowerCase().includes(normalizedQuery) ||
        entry.actorEmail.toLowerCase().includes(normalizedQuery) ||
        entry.target.toLowerCase().includes(normalizedQuery) ||
        auditActionLabel(entry.action).toLowerCase().includes(normalizedQuery) ||
        auditModuleLabel(entry.module).toLowerCase().includes(normalizedQuery);

      const matchesModule = module === 'ALL' || entry.module === module;
      const matchesAction = action === 'ALL' || entry.action === action;
      const matchesDate = !date || entry.createdAt.slice(0, 10) === date;

      return matchesQuery && matchesModule && matchesAction && matchesDate;
    });
  }, [entries, query, module, action, date]);

  const exportCsv = () => {
    const headers = [
      'timestamp',
      'actor',
      'actor_email',
      'actor_role',
      'module',
      'action',
      'target',
      'old_value',
      'new_value',
      'reason',
      'ip_address',
      'device',
    ];

    const rows = filteredEntries.map((entry) => [
      entry.createdAt,
      entry.actorName,
      entry.actorEmail,
      roleLabel(entry.actorRole),
      auditModuleLabel(entry.module),
      auditActionLabel(entry.action),
      entry.target,
      entry.oldValue ?? '',
      entry.newValue ?? '',
      entry.reason ?? '',
      entry.ipAddress,
      entry.device,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Compliance · Operational audit"
        title="Audit log"
        description="Read-only record of sensitive admin actions, workflow changes, approvals, and configuration events."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Audit log' },
        ]}
        rightSlot={
          <Button
            type="button"
            variant="secondary"
            onClick={exportCsv}
            className="rounded-md border-slate-200 bg-white text-[#0B1220]"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-[1500px] space-y-4 px-6 py-5">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-900">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              You are viewing as <span className="font-bold">{actorName}</span> ·{' '}
              <span className="font-bold">{actorRoleLabel}</span>. Auditor access is read-only:
              auditors can query records but cannot create, edit, approve, reject, or initiate actions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard label="Total records" value={entries.length.toLocaleString('en-NG')} />
          <SummaryCard
            label="Admin actions"
            value={entries.filter((entry) => entry.module === 'ADMINS').length.toLocaleString('en-NG')}
            tone="info"
          />
          <SummaryCard
            label="Workflow events"
            value={entries.filter((entry) => entry.module === 'WORKFLOWS').length.toLocaleString('en-NG')}
            tone="warning"
          />
          <SummaryCard
            label="High risk"
            value={entries.filter((entry) => entry.severity === 'DANGER').length.toLocaleString('en-NG')}
            tone="danger"
          />
        </div>

        <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-navy-700" />
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Filters
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_260px_180px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search actor, target, module, action..."
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </label>

            <select
              value={module}
              onChange={(event) => setModule(event.target.value as 'ALL' | AuditModule)}
              className={inputClass}
            >
              {moduleOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All modules' : auditModuleLabel(option)}
                </option>
              ))}
            </select>

            <select
              value={action}
              onChange={(event) => setAction(event.target.value as 'ALL' | AuditAction)}
              className={inputClass}
            >
              {actionOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All actions' : auditActionLabel(option)}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
          </div>
        </Card>

        <SectionCard
          title={`Audit records · ${filteredEntries.length.toLocaleString('en-NG')}`}
          description="Every sensitive operation should eventually write here from the backend. This phase models the admin view only."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-navy-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Timestamp</th>
                  <th className="px-4 py-2 text-left">Actor</th>
                  <th className="px-4 py-2 text-left">Module/action</th>
                  <th className="px-4 py-2 text-left">Target</th>
                  <th className="px-4 py-2 text-left">Old value</th>
                  <th className="px-4 py-2 text-left">New value</th>
                  <th className="px-4 py-2 text-left">Reason/comment</th>
                  <th className="px-4 py-2 text-left">IP/device</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No audit records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr key={entry.auditId}>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold text-[#0B1220]">{entry.actorName}</p>
                        <p className="text-xs text-slate-500">{entry.actorEmail}</p>
                        <p className="text-xs text-slate-400">{roleLabel(entry.actorRole)}</p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusPill tone={auditSeverityTone(entry.severity)}>
                            {auditModuleLabel(entry.module)}
                          </StatusPill>
                          <p className="text-xs font-bold text-slate-600">
                            {auditActionLabel(entry.action)}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <p className="max-w-[220px] text-sm font-semibold text-slate-600">
                          {entry.target}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {entry.auditId}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <ValueBlock value={entry.oldValue} />
                      </td>

                      <td className="px-4 py-3">
                        <ValueBlock value={entry.newValue} />
                      </td>

                      <td className="px-4 py-3">
                        <p className="max-w-[240px] text-xs leading-relaxed text-slate-500">
                          {entry.reason ?? 'No reason recorded'}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-slate-600">{entry.ipAddress}</p>
                        <p className="text-xs text-slate-400">{entry.device}</p>
                      </td>
                    </tr>
                  ))
                )}
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

function ValueBlock({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-xs italic text-slate-400">None</span>;
  }

  return (
    <p className="max-w-[220px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-600">
      {value}
    </p>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'info';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-800'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}