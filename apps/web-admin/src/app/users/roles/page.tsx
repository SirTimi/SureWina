'use client';

import { Check, Minus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

type Role = 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';

const PERMISSIONS: Array<{
  area: string;
  rows: Array<{
    label: string;
    roles: Record<Role, 'FULL' | 'READ' | 'NONE'>;
  }>;
}> = [
  {
    area: 'Draws',
    rows: [
      {
        label: 'Create / edit',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'READ', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'READ' },
      },
      {
        label: 'Open / cancel',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'NONE', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'View audit',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'READ', SUPPORT_AGENT: 'READ' },
      },
    ],
  },
  {
    area: 'Agents',
    rows: [
      {
        label: 'View list',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'READ', FINANCE_OFFICER: 'READ', SUPPORT_AGENT: 'READ' },
      },
      {
        label: 'Suspend / terminate',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'NONE', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'KYC review',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'NONE' },
      },
    ],
  },
  {
    area: 'Claims & payouts',
    rows: [
      {
        label: 'View claims',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'READ', SUPPORT_AGENT: 'FULL' },
      },
      {
        label: 'Approve payouts',
        roles: { OPERATOR: 'NONE', COMPLIANCE_OFFICER: 'NONE', FINANCE_OFFICER: 'FULL', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'Notify winners',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'NONE', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'FULL' },
      },
    ],
  },
  {
    area: 'Finance',
    rows: [
      {
        label: 'Remittance board',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'READ', FINANCE_OFFICER: 'FULL', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'Commission run',
        roles: { OPERATOR: 'NONE', COMPLIANCE_OFFICER: 'NONE', FINANCE_OFFICER: 'FULL', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'Jackpot fund',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'READ', FINANCE_OFFICER: 'FULL', SUPPORT_AGENT: 'NONE' },
      },
    ],
  },
  {
    area: 'Compliance',
    rows: [
      {
        label: 'AML inbox',
        roles: { OPERATOR: 'READ', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'KYC manual review',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'NONE', SUPPORT_AGENT: 'NONE' },
      },
      {
        label: 'Audit log',
        roles: { OPERATOR: 'FULL', COMPLIANCE_OFFICER: 'FULL', FINANCE_OFFICER: 'READ', SUPPORT_AGENT: 'NONE' },
      },
    ],
  },
];

const ROLES: Role[] = ['OPERATOR', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'SUPPORT_AGENT'];

export default function RolesPage() {
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
        eyebrow="System · Roles"
        title="Roles & permissions"
        description="Permission matrix per role. Phase 6 will let you create custom roles; today's roles are fixed."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Admin users', href: '/users' },
          { label: 'Roles' },
        ]}
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        {PERMISSIONS.map((area) => (
          <SectionCard key={area.area} title={area.area} padded={false}>
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Action</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-4 py-2 text-center">
                      {r.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {area.rows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2 font-bold text-[#0B1220]">{row.label}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-4 py-2 text-center">
                        <PermCell value={row.roles[r]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        ))}
      </div>
    </>
  );
}

function PermCell({ value }: { value: 'FULL' | 'READ' | 'NONE' }) {
  if (value === 'FULL') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
        <Check className="h-3 w-3" />
        Full
      </span>
    );
  }
  if (value === 'READ') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700">
        Read
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-300">
      <Minus className="h-3 w-3" />
    </span>
  );
}
