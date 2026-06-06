'use client';

import Link from 'next/link';
import { ArrowLeft, FlagTriangleRight, Info } from 'lucide-react';
import { Card } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { GuardedActionButton } from '@/components/guarded-action-button';
import { PageHeader } from '@/components/page-header';
import type { AdminSession } from '@/lib/admin-auth';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30';

export default function NewEscalationPage() {
  return (
    <AdminShell>
      {(session) => <Body session={session} />}
    </AdminShell>
  );
}

function Body({ session }: { session: AdminSession }) {
  return (
    <>
      <PageHeader
        eyebrow="Compliance · Raise escalation"
        title="Raise auditor escalation"
        description="Escalations are sent to management/Super Admin and stay separate from operational approvals."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Escalations', href: '/escalations' },
          { label: 'Raise escalation' },
        ]}
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card variant="default" className="rounded-3xl border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Escalation details
            </p>
            <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-[#0B1220]">
              Management review request
            </h2>
          </div>

          <form className="space-y-5">
            <Field label="Issue title">
              <input
                className={inputClass}
                placeholder="Example: Suspended admin appears in active review list"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Related module">
                <select className={inputClass}>
                  <option>Admins</option>
                  <option>Agents</option>
                  <option>Draws</option>
                  <option>Workflows</option>
                  <option>Payouts</option>
                  <option>Audit</option>
                  <option>Config</option>
                  <option>Other</option>
                </select>
              </Field>

              <Field label="Severity">
                <select className={inputClass}>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </Field>
            </div>

            <Field label="Related record">
              <input
                className={inputClass}
                placeholder="Example: Workflow · Agent onboarding final approval"
              />
            </Field>

            <Field label="Evidence / comment">
              <textarea
                className={`${inputClass} min-h-36 py-3`}
                placeholder="State what was observed, why it matters, and what management should review."
              />
            </Field>

            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-relaxed text-violet-900">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This does not approve, reject, or mutate the operational record. It only raises
                  a management escalation outside the normal approval workflow.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Link
                href="/escalations"
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to escalations
              </Link>

              <GuardedActionButton
                session={session}
                action="RAISE_ESCALATION"
                variant="accent"
                className="rounded-md font-black"
                icon={<FlagTriangleRight className="h-4 w-4" />}
                audit={{
                  module: 'AUDIT',
                  action: 'CONFIG_CHANGE_REQUESTED',
                  target: 'Auditor escalation draft',
                  oldValue: null,
                  newValue: 'Escalation raised for management review',
                  reason: 'Auditor escalation submitted from frontend mock form',
                }}
              >
                Submit escalation
              </GuardedActionButton>
            </div>
          </form>
        </Card>

        <Card variant="default" className="rounded-3xl border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
            Escalation rule
          </p>
          <h3 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-amber-950">
            Separate from approvals
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            Auditor escalation should never be routed back into the same operational approval chain.
            It goes to management/Super Admin for independent review.
          </p>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-[#0B1220]">
        {label}
      </span>
      {children}
    </label>
  );
}