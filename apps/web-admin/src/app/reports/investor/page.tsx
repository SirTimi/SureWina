'use client';

import { Download, PieChart, TrendingUp, Trophy, UserCog } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function InvestorReportPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const pnl = adminMock.getFinancialPnl('monthly');
  const agents = adminMock.listAgents();
  const draws = adminMock.listDraws({ status: 'EXECUTED' });
  const customers = adminMock.listCustomers();

  const downloadPack = () => {
    const lines = [
      'SUREWINA · INVESTOR MONTHLY PACK',
      `Period · ${new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}`,
      '',
      'P&L (₦)',
      `Revenue,${pnl.revenueNgn}`,
      `Prizes,${pnl.prizesNgn}`,
      `Commission,${pnl.commissionNgn}`,
      `Net,${pnl.netNgn}`,
      '',
      'Network',
      `Active agents,${agents.filter((a) => a.status === 'ACTIVE').length}`,
      `Customers,${customers.length}`,
      `Executed draws,${draws.length}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surewina-investor-${new Date().toISOString().slice(0, 7)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Reports · Investor"
        title="Monthly investor pack"
        description="Headline numbers for the monthly investor update. Generates a downloadable text/PDF artefact."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Reports', href: '/reports' },
          { label: 'Investor' },
        ]}
        rightSlot={
          <Button
            variant="accent"
            onClick={downloadPack}
            className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
          >
            <Download className="h-4 w-4" />
            Generate pack
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile icon={TrendingUp} label="Revenue (MTD)" value={formatNaira(pnl.revenueNgn)} tone="success" />
          <KpiTile icon={PieChart} label="Net" value={formatNaira(pnl.netNgn)} tone={pnl.netNgn >= 0 ? 'success' : 'danger'} />
          <KpiTile icon={UserCog} label="Active agents" value={String(agents.filter((a) => a.status === 'ACTIVE').length)} />
          <KpiTile icon={Trophy} label="Draws executed" value={String(draws.length)} />
        </div>

        <SectionCard title="Headline narrative">
          <p className="text-sm leading-relaxed text-[#1A1816]">
            Surewina processed{' '}
            <span className="font-bold text-navy-700">
              {formatNaira(pnl.revenueNgn)}
            </span>{' '}
            of ticket revenue this month across{' '}
            <span className="font-bold text-[#1A1816]">{draws.length}</span> executed
            draws.{' '}
            <span className="font-bold text-emerald-700">
              {agents.filter((a) => a.status === 'ACTIVE').length}
            </span>{' '}
            agents were active, serving{' '}
            <span className="font-bold text-[#1A1816]">{customers.length}</span>{' '}
            customers. The net P&L was{' '}
            <span
              className={`font-bold ${pnl.netNgn >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
            >
              {formatNaira(pnl.netNgn)}
            </span>{' '}
            after prize payouts and agent commission.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
