'use client';

import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function KycReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const cases = adminMock.listKycCases();
  const total = cases.length;
  const passed = cases.filter((c) => c.status === 'PASSED').length;
  const pending = cases.filter((c) => c.status === 'IN_REVIEW' || c.status === 'AWAITING_DOCS').length;
  const rejected = cases.filter((c) => c.status === 'REJECTED').length;

  const customers = adminMock.listCustomers();
  const tiers = (['NONE', 'OTP_VERIFIED', 'TIER1_COMPLETE', 'TIER2_COMPLETE'] as const).map((t) => ({
    tier: t,
    count: customers.filter((c) => c.kycStatus === t).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Reports · Compliance"
        title="KYC & compliance"
        description="KYC throughput, pass rates, customer distribution across KYC tiers."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'KYC' },
        ]}
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={ClipboardCheck} label="Cases in queue" value={String(total)} />
          <KpiTile
            icon={CheckCircle2}
            label="Passed (rolling)"
            value={`${passed} (${total > 0 ? Math.round((passed / total) * 100) : 0}%)`}
            tone="success"
          />
          <KpiTile
            icon={ClipboardCheck}
            label="Pending"
            value={String(pending)}
            tone={pending > 0 ? 'warning' : 'default'}
          />
          <KpiTile icon={XCircle} label="Rejected" value={String(rejected)} tone="danger" />
        </div>

        <SectionCard title="Customer distribution by KYC tier" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Tier</th>
                <th className="px-4 py-2 text-right">Customers</th>
                <th className="px-4 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tiers.map((t) => {
                const pct =
                  customers.length > 0 ? (t.count / customers.length) * 100 : 0;
                return (
                  <tr key={t.tier}>
                    <td className="px-4 py-2">
                      <StatusPill tone={statusToTone(t.tier)}>{t.tier}</StatusPill>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.count}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex w-full max-w-[160px] items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#4E8F01]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </>
  );
}
