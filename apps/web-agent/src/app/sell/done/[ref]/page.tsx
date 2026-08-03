'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Clock, Copy, Megaphone, Printer, QrCode, Sparkles } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { AgentSalePrint } from '@surewina/api-client';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { TicketReceipt } from '@/components/ticket-reciept';
import { api } from '@/lib/api';

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

interface DoneSale {
  amountNgn: number;
  quantity: number;
  kind: 'DAILY' | 'JACKPOT';
  drawLabel: string;
  customerPhone: string | null;
  notified: boolean;
}

function DoneBody({ ref_ }: { ref_: string }) {
  const search = useSearchParams();
  const queued = search.get('queued') === '1';
  const [copied, setCopied] = useState(false);

  // Screen details come from the confirm redirect — instant, no loading flash.
  const amount = Number(search.get('amount') ?? '0');
  const ticketRefs = (search.get('tickets') ?? '').split(',').filter(Boolean);
  const sale: DoneSale | null = queued
    ? null
    : {
        amountNgn: amount,
        quantity: Number(search.get('qty') ?? '1'),
        kind: (search.get('kind') as 'DAILY' | 'JACKPOT') ?? 'DAILY',
        drawLabel: search.get('label') ?? 'Surewina draw',
        customerPhone: search.get('phone') || null,
        notified: search.get('notified') === '1',
      };

  // Print data is fetched, not passed: the receipt needs terminal, draw
  // number and cutoff, which don't belong in a URL — and this is also the
  // reprint path when an agent returns to a sale later.
  const [printSale, setPrintSale] = useState<AgentSalePrint | null>(null);
  const [printLoading, setPrintLoading] = useState(!queued);

  useEffect(() => {
    if (queued) return; // offline sale — no tickets issued yet
    api.agents
      .saleForPrint(ref_)
      .then(setPrintSale)
      .catch(() => setPrintSale(null))
      .finally(() => setPrintLoading(false));
  }, [ref_, queued]);

  const commission = sale ? Math.round(sale.amountNgn * 0.1) : 0;
  const jackpotMessage = getJackpotMessage(sale);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticketRefs.length ? ticketRefs.join(', ') : ref_);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — don't break the flow.
    }
  };

  return (
    <>
      <style jsx global>{`
        .surewina-print-area {
          display: none;
        }
        @media print {
          @page {
            size: 75mm auto;
            margin: 0;
          }
          body {
            background: #fff !important;
          }
          .surewina-screen {
            display: none !important;
          }
          .surewina-print-area {
            display: block;
          }
          .surewina-receipt-page {
            page-break-after: always;
          }
          .surewina-receipt-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>

      <main className="surewina-screen mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <SaleStepper step={4} />

        <SectionHeading
          eyebrow={queued ? 'Sale queued for sync' : 'Sale complete'}
          title={queued ? 'Customer is covered.' : 'Ticket sale complete.'}
          description={
            queued
              ? 'You were offline. The sale is saved locally and will sync automatically when you are back online.'
              : 'Show the customer the ticket details, then print the tickets if needed.'
          }
        />

        <Card className="overflow-hidden rounded-3xl border-navy-100 bg-white shadow-[0_24px_70px_rgba(14,42,71,0.12)]">
          <div className="bg-navy-800 px-5 py-6 text-center text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">
              {queued ? 'Temporary reference' : 'Sale reference'}
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
              {copied ? 'Copied' : ticketRefs.length > 1 ? 'Copy all refs' : 'Copy reference'}
            </button>
          </div>

          <div className="space-y-3 p-5">
            {queued && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">
                  This reference is temporary. The final tickets will be issued once the
                  sale syncs.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-2xl border border-navy-100 bg-amber-50 p-3 text-navy-950">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
              <div className="text-sm leading-relaxed">
                {ticketRefs.length === 1 ? (
                  <p>
                    Tell the customer:{' '}
                    <span className="font-black">
                      “Your Surewina ticket is {ticketRefs[0]}. Keep it safe — you’ll
                      need it to check results and claim.”
                    </span>
                  </p>
                ) : ticketRefs.length > 1 ? (
                  <>
                    <p className="font-black">
                      {ticketRefs.length} tickets issued — give the customer all references:
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {ticketRefs.map((t) => (
                        <span
                          key={t}
                          className="rounded-sm bg-white/70 px-2 py-1 text-center font-mono text-xs font-black text-navy-950"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      Each ticket claims separately. Print to hand the customer all refs.
                    </p>
                  </>
                ) : (
                  <p>
                    Tell the customer to keep sale reference{' '}
                    <span className="font-black">{ref_}</span> safe until tickets sync.
                  </p>
                )}
              </div>
            </div>

            {sale && jackpotMessage && (
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm font-bold leading-relaxed">{jackpotMessage}</p>
              </div>
            )}

            {sale && (
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <Stat label="Draw name" value={sale.drawLabel} />
                <Stat label="Ticket type" value={formatTicketType(sale.kind)} />
                <Stat label="Quantity" value={String(sale.quantity)} />
                <Stat label="Customer phone" value={sale.customerPhone ?? 'Not provided'} />
                <Stat label="Amount collected" value={formatNaira(sale.amountNgn)} />
                <Stat label="Your commission" value={formatNaira(commission)} />
              </div>
            )}

            {sale && sale.customerPhone && (
              <p className="text-center text-xs text-slate-500">
                {sale.notified
                  ? 'Confirmation SMS sent to the customer.'
                  : 'No SMS sent (no confirmed delivery).'}
              </p>
            )}
          </div>
        </Card>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            disabled={!printSale}
            onClick={() => window.print()}
            className="rounded-sm border-navy-200 bg-white text-navy-700 hover:bg-navy-50 disabled:opacity-50"
          >
            <Printer className="h-5 w-5" />
            {printLoading
              ? 'Preparing…'
              : printSale
                ? `Print ${printSale.tickets.length > 1 ? `${printSale.tickets.length} tickets` : 'ticket'}`
                : 'Print unavailable'}
          </Button>

          <Link href="/sell">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
            >
              <QrCode className="h-5 w-5" />
              New sale
            </Button>
          </Link>

          <Link href="/">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="rounded-sm border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
            >
              Dashboard
            </Button>
          </Link>
        </div>

        {!queued && !printLoading && !printSale && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Ticket details could not be loaded, so printing is unavailable. The sale itself
            is complete — reload this page to try again.
          </p>
        )}
      </main>

      {/* One receipt per ticket, 75mm thermal. Hidden on screen. */}
      {printSale && (
        <section className="surewina-print-area">
          {printSale.tickets.map((tref) => (
            <div key={tref} className="surewina-receipt-page">
              <TicketReceipt sale={printSale} ticketRef={tref} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function getJackpotMessage(sale: DoneSale | null) {
  if (!sale) return null;

  if (sale.kind === 'JACKPOT') {
    return 'Customer bought a direct Sure Jackpot ticket for the coming Saturday draw.';
  }

  const remaining = 10 - (sale.quantity % 10 || 10);
  if (remaining === 0) {
    return `Customer qualified for a free Sure Jackpot entry with ${sale.quantity} regular tickets.`;
  }
  return `${remaining} more regular ticket${remaining === 1 ? '' : 's'} needed to qualify for 1 free Sure Jackpot entry.`;
}

function formatTicketType(kind: 'DAILY' | 'JACKPOT') {
  return kind === 'JACKPOT' ? 'Sure Jackpot ticket' : 'Regular daily ticket';
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-navy-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-sm font-black text-navy-950">
        {value}
      </p>
    </div>
  );
}