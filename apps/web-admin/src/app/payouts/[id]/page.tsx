'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FileSignature,
  ShieldX,
} from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const initial = adminMock.getPayout(id);
  if (!initial) notFound();

  const [payout, setPayout] = useState(initial);
  const [bankRef, setBankRef] = useState(payout.bankReference ?? '');

  const approve = () =>
    setPayout((p) => ({ ...p, status: 'APPROVED', paymentMethod: 'BANK_TRANSFER' }));
  const markPaid = () =>
    setPayout((p) => ({
      ...p,
      status: 'PAID',
      bankReference: bankRef || `GTB-PAYOUT-${Math.floor(Math.random() * 99_999)}`,
      whtCertificateNo: `WHT-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
    }));
  const block = () => setPayout((p) => ({ ...p, status: 'BLOCKED' }));

  const downloadWht = () => {
    const lines = [
      'WITHHOLDING TAX CERTIFICATE',
      `Certificate No: ${payout.whtCertificateNo ?? 'PENDING'}`,
      `Issued to: ${payout.customerName}`,
      `Phone: ${payout.customerPhoneE164}`,
      `Ticket: ${payout.ticketRef}`,
      `Gross prize: ₦${payout.amountNgn.toLocaleString('en-NG')}`,
      `WHT (5%): ₦${payout.whtNgn.toLocaleString('en-NG')}`,
      `Net paid: ₦${payout.netNgn.toLocaleString('en-NG')}`,
      `Issued by: Surewina Lottery NG · ${new Date().toLocaleDateString('en-NG')}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WHT-${payout.payoutId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Payout"
        title={`${payout.customerName} · ${formatNaira(payout.netNgn)}`}
        description={`${payout.ticketRef} · ${payout.customerPhoneE164}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Payouts', href: '/payouts' },
          { label: payout.payoutId },
        ]}
        rightSlot={<StatusPill tone={statusToTone(payout.status)}>{payout.status}</StatusPill>}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Gross prize" value={formatNaira(payout.amountNgn)} />
          <Stat label="WHT (5%)" value={`-${formatNaira(payout.whtNgn)}`} tone="danger" />
          <Stat label="Net to customer" value={formatNaira(payout.netNgn)} tone="success" />
        </div>

        <SectionCard
          title="Bank transfer"
          description="Use your bank's portal to release the net amount, then log the receipt reference."
        >
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Bank receipt reference
            </span>
            <input
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value.toUpperCase())}
              placeholder="GTB-PAYOUT-XXXXXX"
              disabled={payout.status === 'PAID'}
              className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30 disabled:bg-slate-50"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {payout.status === 'AWAITING_APPROVAL' && (
              <Button
                variant="accent"
                onClick={approve}
                className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve payout
              </Button>
            )}
            {payout.status === 'APPROVED' && (
              <Button
                variant="accent"
                onClick={markPaid}
                className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
              >
                <CreditCard className="h-4 w-4" />
                Mark paid & generate WHT cert
              </Button>
            )}
            {payout.status !== 'PAID' && payout.status !== 'BLOCKED' && (
              <Button
                variant="secondary"
                onClick={block}
                className="rounded-md border-red-200 bg-red-50 text-red-700"
              >
                <ShieldX className="h-4 w-4" />
                Block
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Withholding tax certificate">
          {payout.whtCertificateNo ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-sm font-black text-[#0B1220]">
                    {payout.whtCertificateNo}
                  </p>
                  <p className="text-xs text-slate-500">
                    Auto-generated · {formatNaira(payout.whtNgn)} withheld
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={downloadWht}
                className="rounded-md border-slate-200 bg-white text-[#0B1220]"
              >
                <Download className="h-4 w-4" />
                Download certificate
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Banknote className="h-4 w-4" />
              Certificate generates automatically once the payout is marked as PAID.
            </p>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  const tones = {
    default: 'bg-white border-slate-200 text-[#0B1220]',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
  } as const;
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black tracking-[-0.02em] tabular-nums">
        {value}
      </p>
    </div>
  );
}
