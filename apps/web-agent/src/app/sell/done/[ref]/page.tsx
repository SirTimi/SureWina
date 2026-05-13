'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Clock, Copy, Megaphone, QrCode } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { agentMock, type AgentSale } from '@/lib/agent-mock';

export default function SellDonePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  return (
    <AgentShell>
      {() => <DoneBody ref_={ref} />}
    </AgentShell>
  );
}

function DoneBody({ ref_ }: { ref_: string }) {
  const search = useSearchParams();
  const queued = search.get('queued') === '1';
  const [sale, setSale] = useState<AgentSale | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    agentMock.getSaleByRef(ref_).then(setSale);
  }, [ref_]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref_);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — fail silently */
    }
  };

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SaleStepper step={4} />

      <SectionHeading
        eyebrow={queued ? 'Sale queued for sync' : 'Sale complete'}
        title={queued ? 'Customer is covered.' : 'Read this to your customer.'}
        description={
          queued
            ? "You were offline. The sale is saved locally and will sync automatically when you are back online."
            : 'Show or read out the ticket reference. The customer needs it to claim a prize.'
        }
      />

      <Card className="overflow-hidden rounded-3xl border-[#4E8F01]/15 bg-white shadow-[0_24px_70px_rgba(78,143,1,0.14)]">
        <div className="bg-[#4E8F01] px-5 py-6 text-center text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A8E368]">
            Ticket reference
          </p>
          <p className="mt-3 font-mono text-3xl font-black tracking-[0.18em] sm:text-4xl md:text-5xl">
            {ref_}
          </p>
          <button
            type="button"
            onClick={copy}
            className="mx-auto mt-4 inline-flex items-center gap-2 rounded-sm bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white backdrop-blur hover:bg-white/25"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy reference'}
          </button>
        </div>

        <div className="space-y-3 p-5">
          {queued && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                This reference is temporary. The final ticket will be issued once the
                sale syncs.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-2xl border border-[#4E8F01]/15 bg-[#A8E368]/15 p-3 text-navy-950">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-[#4E8F01]" />
            <p className="text-sm leading-relaxed">
              Tell the customer: <span className="font-black">&ldquo;Your Surewina ticket is{' '}
              {chunkRef(ref_)}. Keep it safe — you&apos;ll need it to claim.&rdquo;</span>
            </p>
          </div>

          {sale && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <Stat label="Draw" value={sale.drawLabel} />
              <Stat label="Quantity" value={String(sale.quantity)} />
              <Stat label="Amount collected" value={formatNaira(sale.amountNgn)} />
              <Stat label="Your commission" value={formatNaira(sale.commissionNgn)} />
            </div>
          )}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href="/sell">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            className="rounded-sm !border-transparent bg-[#A8E368] font-black text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
          >
            <QrCode className="h-5 w-5" />
            Start new sale
          </Button>
        </Link>
        <Link href="/">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="rounded-sm border-[#4E8F01]/20 bg-white text-[#4E8F01] hover:bg-[#F8FAF4]"
          >
            Back to dashboard
          </Button>
        </Link>
      </div>
    </main>
  );
}

function chunkRef(ref: string) {
  return ref.replace(/-/g, ' dash ').replace(/(.)/g, '$1 ').trim();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[#F8FAF4] p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-sm font-black text-navy-950">
        {value}
      </p>
    </div>
  );
}
