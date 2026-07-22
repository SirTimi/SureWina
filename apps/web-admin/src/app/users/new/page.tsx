'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, KeyRound, UserPlus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import {
  canPerformAdminAction,
  getAdminActionDeniedReason,
  type AdminSession,
} from '@/lib/admin-auth';
import { api } from '@/lib/api';

const ROLES = [
  { value: 'OPERATOR', label: 'Operator', hint: 'Draws, agents, tickets, day-to-day operations' },
  { value: 'COMPLIANCE_OFFICER', label: 'Compliance officer', hint: 'KYC review, audit log, statutory reports' },
  { value: 'FINANCE_OFFICER', label: 'Finance officer', hint: 'Remittances, payouts, refunds' },
  { value: 'SUPPORT_AGENT', label: 'Support agent', hint: 'Lookups only — customer assistance' },
];

const TIERS = [
  { value: 'BASIC', label: 'Basic', hint: 'View and routine actions' },
  { value: 'INTERMEDIATE', label: 'Intermediate', hint: 'Propose changes needing approval' },
  { value: 'SUPER', label: 'Super', hint: 'Final approval, config, user management' },
  { value: 'AUDITOR', label: 'Auditor', hint: 'Read-only across the platform' },
];

export default function NewAdminUserPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('OPERATOR');
  const [tier, setTier] = useState('BASIC');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const allowed = canPerformAdminAction(session.tier, 'APPROVE_DRAW_SETUP');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@') || fullName.trim().length < 2) {
      setError('Enter a valid email and full name.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.admin.createAdminUser({
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        role,
        tier,
      });
      setCreated({ name: res.fullName, email: res.email, password: res.temporaryPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create admin.');
      setSubmitting(false);
    }
  };

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="System" title="New admin" breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Users', href: '/users' }, { label: 'New' }]} />
        <div className="mx-auto max-w-[720px] px-6 py-10">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
            <p className="mt-3 text-sm text-slate-700">
              {getAdminActionDeniedReason(session.tier, 'APPROVE_DRAW_SETUP')}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (created) {
    return (
      <>
        <PageHeader eyebrow="System" title="Admin created" breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Users', href: '/users' }, { label: 'Created' }]} />
        <div className="mx-auto max-w-[720px] px-6 py-5">
          <SectionCard title={`${created.name} can now sign in`}>
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
                <KeyRound className="h-4 w-4" />
                Temporary password — shown once
              </p>
              <p className="mt-2 break-all rounded-md bg-white p-3 font-mono text-lg font-black text-[#0B1220]">
                {created.password}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(created.password)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-800"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              <p className="mt-3 text-xs leading-relaxed text-amber-800">
                Give this to {created.name} in person or over a channel you trust — it is not stored
                and cannot be shown again. If it is lost, reset the password from their profile.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <Link href="/users" className="rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white">
                Back to users
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  setEmail('');
                  setFullName('');
                  setSubmitting(false);
                }}
                className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600"
              >
                Create another
              </button>
            </div>
          </SectionCard>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="New admin"
        description="Creates an account with a one-time temporary password."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Users', href: '/users' }, { label: 'New' }]}
      />
      <div className="mx-auto max-w-[720px] px-6 py-5">
        <form onSubmit={submit}>
          <SectionCard title="Account">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Full name</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Amaka Obi"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-[#0B1220]">Work email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="amaka@surewina.ng"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-700"
                  />
                </div>
              </div>

              <Picker label="Function" options={ROLES} value={role} onChange={setRole} />
              <Picker label="Clearance" options={TIERS} value={tier} onChange={setTier} />

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0B1220] px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300"
                >
                  <UserPlus className="h-4 w-4" />
                  {submitting ? 'Creating…' : 'Create admin'}
                </button>
                <Link href="/users" className="rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600">
                  Cancel
                </Link>
              </div>
            </div>
          </SectionCard>
        </form>
      </div>
    </>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; hint: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-[#0B1220]">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              value === o.value
                ? 'rounded-lg border-2 border-navy-700 bg-navy-50 p-3 text-left'
                : 'rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-300'
            }
          >
            <span className="block text-sm font-black text-[#0B1220]">{o.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}