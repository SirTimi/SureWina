'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Copy, KeyRound, Lock, Power, ShieldCheck } from 'lucide-react';
import type { AdminUserRow } from '@surewina/api-client';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { canPerformAdminAction, type AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const ROLES = ['OPERATOR', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'SUPPORT_AGENT'];
const TIERS = ['BASIC', 'INTERMEDIATE', 'SUPER', 'AUDITOR'];

export default function AdminUserDetailPage({ params }: { params: Promise<{ adminUserId: string }> }) {
  const { adminUserId } = use(params);
  return <AdminShell>{(session) => <Body id={adminUserId} session={session} />}</AdminShell>;
}

function Body({ id, session }: { id: string; session: AdminSession }) {
  const [user, setUser] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const canManage = canPerformAdminAction(session.tier, 'APPROVE_DRAW_SETUP');
  const isSelf = user?.email === session.email;

  const load = () => {
    setLoading(true);
    api.admin
      .adminUserDetail(id)
      .then(setUser)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load admin.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const patch = async (input: { role?: string; tier?: string; isActive?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateAdminUser(id, input);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset this admin\'s password? Their current password stops working immediately.')) return;
    setBusy(true);
    try {
      const res = await api.admin.resetAdminPassword(id);
      setNewPassword(res.temporaryPassword);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error ?? 'Admin not found.'}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="System · Admin user"
        title={user.fullName}
        description={user.email}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Users', href: '/users' },
          { label: user.fullName },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={user.isActive ? 'success' : 'neutral'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </StatusPill>
            {user.locked && (
              <StatusPill tone="danger" icon={<Lock className="h-3 w-3" />}>
                Locked
              </StatusPill>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-[860px] space-y-4 px-6 py-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {newPassword && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
              <KeyRound className="h-4 w-4" />
              New temporary password — shown once
            </p>
            <p className="mt-2 break-all rounded-md bg-white p-3 font-mono text-lg font-black text-[#0B1220]">
              {newPassword}
            </p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(newPassword)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-800"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
        )}

        <SectionCard title="Account">
          <Row label="Function">{user.role.replace(/_/g, ' ')}</Row>
          <Row label="Clearance">{user.tier}</Row>
          <Row label="MFA">{user.mfaEnabled ? 'Enabled' : 'Not enabled'}</Row>
          <Row label="Last login">
            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-NG') : 'Never'}
          </Row>
          <Row label="Created">
            {new Date(user.createdAt).toLocaleDateString('en-NG', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </Row>
        </SectionCard>

        {canManage && !isSelf && (
          <SectionCard title="Manage" description="Changes are audited with their previous values.">
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-bold text-[#0B1220]">Function</p>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={busy || r === user.role}
                      onClick={() => patch({ role: r })}
                      className={
                        r === user.role
                          ? 'rounded-md bg-[#0B1220] px-3 py-1.5 text-xs font-black text-white'
                          : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-navy-200'
                      }
                    >
                      {r.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-bold text-[#0B1220]">Clearance</p>
                <div className="flex flex-wrap gap-1.5">
                  {TIERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busy || t === user.tier}
                      onClick={() => patch({ tier: t })}
                      className={
                        t === user.tier
                          ? 'rounded-md bg-[#0B1220] px-3 py-1.5 text-xs font-black text-white'
                          : 'rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-navy-200'
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patch({ isActive: !user.isActive })}
                  className={
                    user.isActive
                      ? 'inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700'
                      : 'inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700'
                  }
                >
                  <Power className="h-4 w-4" />
                  {user.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={reset}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#0B1220]"
                >
                  <KeyRound className="h-4 w-4" />
                  Reset password{user.locked ? ' & unlock' : ''}
                </button>
              </div>
            </div>
          </SectionCard>
        )}

        {isSelf && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
            <p className="text-xs leading-relaxed text-slate-600">
              This is your own account. Role, clearance, and active status can only be changed by
              another SUPER admin — that rule is enforced server-side and prevents anyone locking
              the platform out of its own administration.
            </p>
          </div>
        )}

        <Link href="/users" className="inline-block text-sm font-black text-navy-700 hover:underline">
          ← All admins
        </Link>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-[#0B1220]">{children}</span>
    </div>
  );
}