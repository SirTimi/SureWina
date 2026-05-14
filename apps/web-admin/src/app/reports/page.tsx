'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  Banknote,
  ClipboardCheck,
  FileSignature,
  Globe,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UserCog,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';

const REPORTS = [
  {
    href: '/reports/sales',
    label: 'Daily sales',
    description: 'Tickets sold + revenue broken down by state.',
    icon: TrendingUp,
  },
  {
    href: '/reports/agents',
    label: 'Agent performance',
    description: 'Top sellers, tier movements, remittance compliance.',
    icon: UserCog,
  },
  {
    href: '/reports/draws',
    label: 'Draw audit',
    description: 'Per-draw audit packs — RNG, winner verification, breakdown.',
    icon: Trophy,
  },
  {
    href: '/reports/levy',
    label: 'State levy',
    description: 'State Games Management Board levy per state.',
    icon: Globe,
  },
  {
    href: '/reports/kyc',
    label: 'KYC & compliance',
    description: 'KYC throughput, pass rates, flagged customer counts.',
    icon: ClipboardCheck,
  },
  {
    href: '/compliance/aml',
    label: 'NFIU AML flags',
    description: 'Suspicious activity inbox — review, escalate, close.',
    icon: AlertOctagon,
  },
  {
    href: '/reports/wht',
    label: 'WHT certificates',
    description: 'Withholding tax certificates issued to prize winners.',
    icon: FileSignature,
  },
  {
    href: '/reports/investor',
    label: 'Investor monthly',
    description: 'Investor-ready monthly pack — P&L, KPIs, growth.',
    icon: PieChart,
  },
  {
    href: '/reports/financial',
    label: 'Financial P&L',
    description: 'Daily / weekly / monthly P&L statements.',
    icon: Banknote,
  },
];

export default function ReportsHubPage() {
  return (
    <AdminShell>
      {() => (
        <>
          <PageHeader
            eyebrow="Reports"
            title="Reports hub"
            description="Compliance, finance, operations, and investor reports — generated from the same source data."
            breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Reports' }]}
          />

          <div className="mx-auto max-w-[1200px] px-6 py-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {REPORTS.map((r) => {
                const Icon = r.icon;
                return (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#4E8F01]/30 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[#A8E368]/30 text-[#4E8F01]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-base font-black text-[#0B1220] group-hover:text-[#4E8F01]">
                      {r.label}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{r.description}</p>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#4E8F01]" />
              <p className="text-slate-500">
                All reports are role-gated. Compliance officers can see everything except finance disbursements; finance officers see everything except KYC document content; operators see all.
              </p>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
