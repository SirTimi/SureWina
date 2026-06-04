'use client';

import Link from 'next/link';
import { ArrowLeft, Info, Send } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { roleLabel } from '@/lib/admin-auth';
import { adminRoleOptions, clearanceLabel } from '@/lib/admin-users-mock';

export default function NewAdminUserPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  return (
    <>
      <PageHeader
        eyebrow="System · Admin users"
        title="Create admin profile"
        description="Create a pending admin profile. The account remains inactive until Super Admin authorization."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Admin users', href: '/users' }, { label: 'Create admin' }]}
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Admin profile details</p>
              <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-[#0B1220]">New admin request</h2>
            </div>
            <StatusPill tone="warning">Pending approval</StatusPill>
          </div>

          <form className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Full name"><input className={inputClass} placeholder="Maryam Yusuf" /></Field>
              <Field label="Email address"><input className={inputClass} type="email" placeholder="maryam.yusuf@surewina.ng" /></Field>
              <Field label="Phone number"><input className={inputClass} placeholder="+2348010010005" /></Field>
              <Field label="Department"><input className={inputClass} placeholder="Agent Support" /></Field>
            </div>

            <Field label="Assigned role">
              <select className={inputClass}>
                {adminRoleOptions.map((option) => (
                  <option key={option.role} value={option.role}>{option.label} · {clearanceLabel(option.clearanceLevel)}</option>
                ))}
              </select>
            </Field>

            <Field label="Assigned function / scope">
              <textarea className={`${inputClass} min-h-28 py-3`} placeholder="Describe exactly what this admin is allowed to do." />
            </Field>

            <Field label="Reason for access">
              <textarea className={`${inputClass} min-h-24 py-3`} placeholder="Why is this admin access needed?" />
            </Field>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Submitting this creates a pending admin profile only. The account is activated after Super Admin review.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Link href="/users" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" />
                Back to users
              </Link>
              <Button type="button" variant="accent" className="rounded-md font-black">
                <Send className="h-4 w-4" />
                Create pending admin
              </Button>
            </div>
          </form>
        </Card>

        <aside className="space-y-3">
          <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">Role guide</p>
            <div className="mt-4 space-y-3">
              {adminRoleOptions.map((option) => (
                <div key={option.role} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="font-bold text-[#0B1220]">{roleLabel(option.role)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{clearanceLabel(option.clearanceLevel)}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{option.description}</p>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-[#0B1220]">{label}</span>
      {children}
    </label>
  );
}
