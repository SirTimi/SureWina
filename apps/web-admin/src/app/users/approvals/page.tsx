'use client';

import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { roleLabel } from '@/lib/admin-auth';
import {
  clearanceLabel,
  listPendingAdminUsers,
  type AdminManagementUser,
} from '@/lib/admin-users-mock';

export default function AdminApprovalsPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const pendingUsers = listPendingAdminUsers();

  return (
    <>
      <PageHeader
        eyebrow="System · Admin approvals"
        title="Pending admin authorizations"
        description="Review newly created admin profiles before account activation. Approval is a Super Admin action."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Admin users', href: '/users' }, { label: 'Approvals' }]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <DataTable<AdminManagementUser>
          rows={pendingUsers}
          rowKey={(u) => u.adminUserId}
          searchPlaceholder="Search pending admins…"
          searchFn={(u, q) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.department.toLowerCase().includes(q)
          }
          emptyMessage="No pending admin approvals."
          columns={[
            {
              key: 'profile',
              header: 'Pending profile',
              render: (u) => (
                <div>
                  <Link href={`/users/${u.adminUserId}`} className="font-bold text-[#0B1220] hover:text-navy-700 hover:underline">{u.fullName}</Link>
                  <p className="text-xs text-slate-500">{u.email}</p>
                  <p className="text-xs text-slate-400">{u.phoneE164}</p>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Requested role',
              render: (u) => (
                <div>
                  <StatusPill tone="warning">{roleLabel(u.role)}</StatusPill>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{clearanceLabel(u.clearanceLevel)}</p>
                </div>
              ),
            },
            {
              key: 'function',
              header: 'Assigned function',
              render: (u) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{u.department}</p>
                  <p className="max-w-[340px] text-xs leading-relaxed text-slate-500">{u.functionScope}</p>
                </div>
              ),
            },
            {
              key: 'created',
              header: 'Created by',
              render: (u) => (
                <div className="text-xs leading-relaxed text-slate-500">
                  <p className="font-bold text-[#0B1220]">{u.createdBy}</p>
                  <p>{new Date(u.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ),
            },
            {
              key: 'actions',
              header: 'Super Admin action',
              align: 'right',
              render: (u) => (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" className="rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button type="button" variant="accent" size="sm" className="rounded-md font-black">
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
