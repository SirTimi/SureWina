'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AdminAuditIntegrity, AdminAuditRow, AdminAuditSearch } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';

const SEVERITIES = ['', 'INFO', 'WARNING', 'CRITICAL'];
const ACTOR_TYPES = ['', 'SYSTEM', 'CUSTOMER', 'AGENT', 'ADMIN', 'ENGINE'];

export default function AuditLogPage() {
  return <AdminShell>{() => <Body />}</AdminShell>;
}

function Body() {
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState('');
  const [severity, setSeverity] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAuditSearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<AdminAuditIntegrity | null>(null);

  useEffect(() => {
    api.admin
      .auditIntegrity()
      .then(setIntegrity)
      .catch(() => setIntegrity(null));
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    api.admin
      .searchAudit({
        action: action.trim() || undefined,
        actorType: actorType || undefined,
        severity: severity || undefined,
        resourceId: resourceId.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        pageSize: 50,
      })
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not search the audit log.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page]);

  const applyFilters = () => {
    setPage(1);
    load();
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        description="Append-only record of every consequential action. Database triggers reject updates and deletes."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Audit log' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {integrity && integrity.checkpoints > 0 && (
          <div
            className={
              integrity.intact
                ? 'flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4'
                : 'flex items-start gap-3 rounded-xl border-2 border-red-400 bg-red-50 p-4'
            }
          >
            {integrity.intact ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}
            <div className="min-w-0">
              {integrity.intact ? (
                <>
                  <p className="text-sm font-black text-emerald-800">
                    Integrity verified — {integrity.checkpoints} checkpoint
                    {integrity.checkpoints === 1 ? '' : 's'} recomputed and matching
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-emerald-700">
                    Latest root: {integrity.latestRootHash}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-red-800">
                    {integrity.brokenWindows} checkpoint
                    {integrity.brokenWindows === 1 ? '' : 's'} failed verification — audit entries
                    were altered or removed after sealing. Investigate immediately.
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-red-700">
                    {integrity.results
                      .filter((r) => !r.intact)
                      .map((r) => `seq ${r.fromSeq}–${r.toSeq} (${r.foundEntries}/${r.expectedEntries} entries)`)
                      .join(' · ')}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        <SectionCard title="Filters">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Action (exact, e.g. ADMIN_LOGIN_SUCCEEDED)"
              className="col-span-2 h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <select
              value={actorType}
              onChange={(e) => setActorType(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            >
              {ACTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || 'Any actor'}
                </option>
              ))}
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s || 'Any severity'}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
            />
            <input
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="Resource ID (claim, draw, agent…)"
              className="col-span-2 h-10 rounded-md border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-navy-700"
            />
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0B1220] px-4 text-sm font-black text-white"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </SectionCard>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : !data ? null : (
          <SectionCard
            title={`${data.total.toLocaleString('en-NG')} entries`}
            description={`Page ${data.page} of ${totalPages}.`}
            padded={false}
            rightSlot={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            }
          >
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Severity</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No entries match these filters.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <Fragment key={r.logId}>
                      <tr
                        onClick={() => setOpenId(openId === r.logId ? null : r.logId)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-3 py-2 text-slate-400">
                          {openId === r.logId ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                          {new Date(r.timestamp).toLocaleString('en-NG', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill
                            tone={
                              r.severity === 'CRITICAL'
                                ? 'danger'
                                : r.severity === 'WARNING'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {r.severity}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-bold text-[#0B1220]">{r.actorType}</p>
                          {r.actorId && (
                            <p className="max-w-[140px] truncate font-mono text-[10px] text-slate-500">
                              {r.actorId}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs font-black text-navy-700">
                          {r.action}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs text-slate-600">{r.resourceType}</p>
                          <p className="max-w-[180px] truncate font-mono text-[10px] text-slate-500">
                            {r.resourceId}
                          </p>
                        </td>
                      </tr>
                      {openId === r.logId && (
                        <tr className="bg-[#F8FAF4]">
                          <td />
                          <td colSpan={5} className="px-3 py-3">
                            <pre className="overflow-x-auto rounded-md bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                            {r.ipAddress && (
                              <p className="mt-2 font-mono text-[10px] text-slate-500">
                                IP: {r.ipAddress}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
          <p className="text-xs leading-relaxed text-slate-600">
            This log is append-only, enforced at the database level: UPDATE and DELETE are rejected
            by triggers regardless of application code. Entries are additionally sealed into
            periodic checkpoints — each hashes its window and chains to the one before, so an
            alteration made directly in the database still fails verification. The latest root is
            published with the daily regulatory report.
          </p>
        </div>
      </div>
    </>
  );
}