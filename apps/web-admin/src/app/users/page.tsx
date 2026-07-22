'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, UserPlus } from 'lucide-react';
import type { AdminUserRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { canPerformAdminAction, type AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const TIER_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  SUPER: 'danger',
  INTERMEDIATE: 'warning',
  BASIC: 'info',
  AUDITOR: 'neutral',
};

export default function AdminUsersPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = canPerformAdminAction(session.tier, 'APPROVE_DRAW_SETUP');

  useEffect(() => {
    api.admin
      .listAdminUsers()
      .then((res) => setUsers(res.users))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load admin users.'))
      .finally(() => setLoading(false));
  }, []);

  const active = users.filter((u) => u.isActive);
  const inactive = users.filter((u) => !u.isActive);

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Admin users"
        description="Who can sign in to this portal, at what function and clearance."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Users' }]}
        rightSlot={
          canManage ? (
            <Link
              href="/users/new"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-black text-accent-foreground shadow-sm hover:bg-amber-400"
            >
              <UserPlus className="h-4 w-4" />
              New admin
            </Link>
          ) : null
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-white" />
        ) : (
          <>
            <UserTable title={`Active (${active.length})`} rows={active} />
            {inactive.length > 0 && (
              <UserTable title={`Deactivated (${inactive.length})`} rows={inactive} dim />
            )}

            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <p className="text-xs leading-relaxed text-slate-600">
                <span className="font-black">Function</span> decides which parts of the system an
                admin can reach (operations, compliance, finance, support).{' '}
                <span className="font-black">Clearance</span> decides how consequential their
                actions may be — SUPER approves what INTERMEDIATE proposes.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function UserTable({ title, rows, dim }: { title: string; rows: AdminUserRow[]; dim?: boolean }) {
  return (
    <SectionCard title={title} padded={false}>
      <table className="min-w-full text-sm">
        <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left">Admin</th>
            <th className="px-4 py-2 text-left">Function</th>
            <th className="px-4 py-2 text-left">Clearance</th>
            <th className="px-4 py-2 text-left">Last login</th>
            <th className="px-4 py-2 text-left">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((u) => (
            <tr key={u.adminUserId} className={dim ? 'opacity-60' : ''}>
              <td className="px-4 py-3">
                <Link
                  href={`/users/${u.adminUserId}`}
                  className="font-bold text-[#0B1220] hover:text-navy-700"
                >
                  {u.fullName}
                </Link>
                <p className="text-xs text-slate-500">{u.email}</p>
              </td>
              <td className="px-4 py-3 text-xs font-bold">{u.role.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3">
                <StatusPill tone={TIER_TONE[u.tier] ?? 'neutral'}>{u.tier}</StatusPill>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {u.lastLoginAt
                  ? new Date(u.lastLoginAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={u.isActive ? 'success' : 'neutral'}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </StatusPill>
                  {u.locked && (
                    <StatusPill tone="danger" icon={<Lock className="h-3 w-3" />}>
                      Locked
                    </StatusPill>
                  )}
                  {u.mfaEnabled && <StatusPill tone="info">MFA</StatusPill>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}