'use client';

import Link from 'next/link';
import { Plus, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type AdminUserRow } from '@/lib/admin-mock';

export default function AdminUsersPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const rows = adminMock.listAdminUsers();

  return (
    <>
      <PageHeader
        eyebrow="System · Admin users"
        title="Admin user management"
        description="Operator console users. MFA is required for everyone — Phase 6 will enforce this server-side."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Admin users' }]}
        rightSlot={
          <div className="flex items-center gap-2">
            <Link
              href="/users/roles"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Roles & permissions
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-black text-white hover:bg-navy-900"
            >
              <Plus className="h-4 w-4" />
              Invite user
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-3 px-6 py-5">
        <DataTable<AdminUserRow>
          rows={rows}
          rowKey={(u) => u.adminUserId}
          searchPlaceholder="Search by name or email…"
          searchFn={(u, q) =>
            u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
          }
          columns={[
            {
              key: 'name',
              header: 'User',
              render: (u) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{u.fullName}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Role',
              render: (u) => (
                <StatusPill
                  tone={
                    u.role === 'OPERATOR'
                      ? 'success'
                      : u.role === 'COMPLIANCE_OFFICER'
                        ? 'warning'
                        : u.role === 'FINANCE_OFFICER'
                          ? 'info'
                          : 'violet'
                  }
                >
                  {u.role.replace(/_/g, ' ')}
                </StatusPill>
              ),
            },
            {
              key: 'mfa',
              header: 'MFA',
              render: (u) => (
                <StatusPill tone={u.mfaEnabled ? 'success' : 'warning'}>
                  {u.mfaEnabled ? 'Enabled' : 'Off'}
                </StatusPill>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (u) => <StatusPill tone={statusToTone(u.status)}>{u.status}</StatusPill>,
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
          ]}
        />
      </div>
    </>
  );
}
