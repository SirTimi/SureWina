import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { roleLabel } from '@/lib/admin-auth';
import {
  clearanceLabel,
  getAdminManagementUser,
  statusTone,
} from '@/lib/admin-users-mock';

interface AdminProfilePageProps {
  params: Promise<{ adminUserId: string }>;
}

export default async function AdminProfilePage({ params }: AdminProfilePageProps) {
  const { adminUserId } = await params;
  const user = getAdminManagementUser(adminUserId);

  if (!user) notFound();

  return (
    <AdminShell>
      {() => (
        <>
          <PageHeader
            eyebrow="System · Admin profile"
            title={user.fullName}
            description="Full admin profile, clearance level, approval state, and access metadata."
            breadcrumbs={[
              { label: 'Admin', href: '/' },
              { label: 'Admin users', href: '/users' },
              { label: user.fullName },
            ]}
            rightSlot={
              <Link href="/users" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" />
                Back to users
              </Link>
            }
          />

          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Identity</p>
                    <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#0B1220]">{user.fullName}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{user.email}</p>
                    <p className="text-sm font-semibold text-slate-500">{user.phoneE164}</p>
                  </div>
                  <StatusPill tone={statusTone(user.status)}>{user.status}</StatusPill>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <InfoBlock label="Role" value={roleLabel(user.role)} />
                  <InfoBlock label="Clearance level" value={clearanceLabel(user.clearanceLevel)} />
                  <InfoBlock label="Department" value={user.department} />
                  <InfoBlock label="MFA" value={user.mfaEnabled ? 'Enabled' : 'Not enabled'} />
                  <InfoBlock label="Last login" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'} />
                  <InfoBlock label="Admin user ID" value={user.adminUserId} mono />
                </div>
              </Card>

              <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Assigned function</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{user.functionScope}</p>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Notes</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{user.notes}</p>
                </div>
              </Card>

              <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Approval record</p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <InfoBlock label="Created by" value={user.createdBy} />
                  <InfoBlock label="Created at" value={formatDate(user.createdAt)} />
                  <InfoBlock label="Approved by" value={user.approvedBy ?? 'Pending approval'} />
                  <InfoBlock label="Approved at" value={user.approvedAt ? formatDate(user.approvedAt) : 'Pending approval'} />
                </div>
              </Card>
            </div>

            <aside className="space-y-4">
              <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Authorization controls</p>
                <h3 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-[#0B1220]">Super Admin action</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Approval activates a pending admin. Rejecting keeps the account inactive and records the decision.
                </p>

                {user.status === 'PENDING' ? (
                  <div className="mt-5 grid grid-cols-1 gap-2">
                    <Button type="button" variant="accent" className="rounded-md font-black">
                      <CheckCircle2 className="h-4 w-4" />
                      Approve admin
                    </Button>
                    <Button type="button" variant="secondary" className="rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                      <XCircle className="h-4 w-4" />
                      Reject request
                    </Button>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    No pending approval action for this account.
                  </div>
                )}
              </Card>

              <Card variant="default" className="rounded-3xl border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">Control note</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900">
                  This is the frontend approval flow. Backend enforcement, audit logging, and real mutation actions come in later phases.
                </p>
              </Card>
            </aside>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function InfoBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={mono ? 'mt-1 font-mono text-sm font-bold text-[#0B1220]' : 'mt-1 text-sm font-bold text-[#0B1220]'}>{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
