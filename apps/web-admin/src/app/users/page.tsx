'use client';

import Link from 'next/link';
import { CheckCircle2, Plus, ShieldCheck, UserCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { roleLabel } from '@/lib/admin-auth';
import {
  clearanceLabel,
  listAdminManagementUsers,
  listPendingAdminUsers,
  statusTone,
  type AdminManagementUser,
} from '@/lib/admin-users-mock';

export default function AdminUsersPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = listAdminManagementUsers();
  const pending = listPendingAdminUsers();

  return (
    <>
      <PageHeader
        eyebrow="System · Admin users"
        title="Admin user management"
        description="Create, profile, review, and authorize admin access. New admins remain pending until Super Admin approval."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Admin users' }]}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/users/approvals"
              className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approvals {pending.length > 0 ? `(${pending.length})` : ''}
            </Link>
            <Link
              href="/users/roles"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Roles & permissions
            </Link>
            <Link
              href="/users/new"
              className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
            >
              <Plus className="h-4 w-4" />
              Create admin
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard label="Total admins" value={rows.length.toLocaleString('en-NG')} />
          <SummaryCard label="Pending approval" value={pending.length.toLocaleString('en-NG')} tone="warning" />
          <SummaryCard label="Active" value={rows.filter((u) => u.status === 'ACTIVE').length.toLocaleString('en-NG')} tone="success" />
          <SummaryCard label="Restricted" value={rows.filter((u) => u.status === 'SUSPENDED' || u.status === 'REVOKED').length.toLocaleString('en-NG')} tone="danger" />
        </div>

        <DataTable<AdminManagementUser>
          rows={rows}
          rowKey={(u) => u.adminUserId}
          searchPlaceholder="Search by name, email, role, department…"
          searchFn={(u, q) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            roleLabel(u.role).toLowerCase().includes(q) ||
            u.department.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'name',
              header: 'Admin profile',
              render: (u) => (
                <div>
                  <Link href={`/users/${u.adminUserId}`} className="font-bold text-[#0B1220] hover:text-navy-700 hover:underline">
                    {u.fullName}
                  </Link>
                  <p className="text-xs text-slate-500">{u.email}</p>
                  <p className="text-xs text-slate-400">{u.phoneE164}</p>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Role / clearance',
              render: (u) => (
                <div className="space-y-1">
                  <StatusPill tone={roleTone(u.role)}>{roleLabel(u.role)}</StatusPill>
                  <p className="text-xs font-semibold text-slate-500">{clearanceLabel(u.clearanceLevel)}</p>
                </div>
              ),
            },
            {
              key: 'department',
              header: 'Department / function',
              render: (u) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{u.department}</p>
                  <p className="max-w-[280px] text-xs leading-relaxed text-slate-500">{u.functionScope}</p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (u) => <StatusPill tone={statusTone(u.status)}>{u.status}</StatusPill>,
            },
            {
              key: 'approval',
              header: 'Created / approved',
              render: (u) => (
                <div className="text-xs leading-relaxed text-slate-500">
                  <p>Created by <span className="font-bold text-[#0B1220]">{u.createdBy}</span></p>
                  <p>Approved by <span className="font-bold text-[#0B1220]">{u.approvedBy ?? 'Pending'}</span></p>
                </div>
              ),
            },
            {
              key: 'login',
              header: 'Last login',
              render: (u) =>
                u.lastLoginAt ? (
                  <span className="text-xs text-slate-500">
                    {new Date(u.lastLoginAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ) : (
                  <span className="text-xs italic text-slate-400">Never</span>
                ),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (u) => (
                <Link href={`/users/${u.adminUserId}`} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline">
                  <UserCheck className="h-3.5 w-3.5" />
                  Open
                </Link>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function roleTone(role: AdminManagementUser['role']): 'success' | 'warning' | 'info' | 'violet' {
  if (role === 'BASIC_ADMIN') return 'success';
  if (role === 'INTERMEDIATE_ADMIN') return 'info';
  if (role === 'SUPER_ADMIN') return 'warning';
  return 'violet';
}
