'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Clock, Copy, Megaphone, Printer, QrCode, Sparkles } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { api } from '@/lib/api';
import { AgentSalePrint } from '@surewina/api-client';
import { TicketReceipt } from '@/components/ticket-reciept';

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

  // Sale details come from the confirm redirect — no lookup needed.
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

  const printTicket = () => {
    if (!sale || queued || ticketRefs.length === 0) return;
    window.print();
  };

  const [printSale, setPrintSale] = useState<AgentSalePrint | null>(null);

  useEffect(() => {
    if (queued) return; // offline sale — nothing to print yet
    api.agents
      .saleForPrint(ref_)
      .then(setPrintSale)
      .catch(() => setPrintSale(null));
  }, [ref_, queued]);

  return (
    <>
      <style jsx global>{`
        @media screen {
          .surewina-print-ticket {
            display: none !important;
          }
        }
        @media print {
          body {
            background: white !important;
          }
          .surewina-screen {
            display: none !important;
          }
          .surewina-print-ticket {
            display: block !important;
            padding: 24px;
            color: #1a1816;
            font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          .surewina-ticket-paper {
            width: 100%;
            max-width: 360px;
            margin: 0 auto 24px;
            border: 1px solid #1a1816;
            padding: 18px;
            page-break-after: always;
          }
          .surewina-ticket-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            color: #5e5f62;
            margin: 0 0 4px;
          }
          .surewina-ticket-value {
            font-size: 14px;
            font-weight: 800;
            margin: 0 0 12px;
          }
          .surewina-ticket-ref {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 26px;
            font-weight: 900;
            letter-spacing: 0.12em;
            margin: 8px 0 18px;
            text-align: center;
          }
          .surewina-ticket-title {
            font-size: 22px;
            font-weight: 900;
            margin: 0;
            text-align: center;
          }
          .surewina-ticket-note {
            border-top: 1px dashed #999ea7;
            margin-top: 14px;
            padding-top: 12px;
            font-size: 12px;
            line-height: 1.5;
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
            disabled={!sale || queued || ticketRefs.length === 0}
            onClick={printTicket}
            className="rounded-sm border-navy-200 bg-white text-navy-700 hover:bg-navy-50 disabled:opacity-50"
          >
            {printSale && (
        <>
          <Button onClick={() => window.print()} className="no-print">
            <Printer className="h-4 w-4" />
            Print {printSale.tickets.length > 1 ? `${printSale.tickets.length} tickets` : 'ticket'}
          </Button>

          <div className="print-area">
            {printSale.tickets.map((t) => (
              <div key={t} className="receipt-page">
                <TicketReceipt sale={printSale} ticketRef={t} />
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        .print-area {
          display: none;
        }
        @media print {
          @page {
            size: 75mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            display: block;
            position: absolute;
            left: 0;
            top: 0;
          }
          .receipt-page {
            page-break-after: always;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
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
      </main>

      {sale && ticketRefs.length > 0 && (
        <section className="surewina-print-ticket">
          {ticketRefs.map((tref) => (
            <div key={tref} className="surewina-ticket-paper">
              <p className="surewina-ticket-title">Surewina Ticket</p>

              <p className="surewina-ticket-ref">{tref}</p>

              <p className="surewina-ticket-label">Draw name</p>
              <p className="surewina-ticket-value">{sale.drawLabel}</p>

              <p className="surewina-ticket-label">Ticket type</p>
              <p className="surewina-ticket-value">{formatTicketType(sale.kind)}</p>

              <p className="surewina-ticket-label">Customer phone</p>
              <p className="surewina-ticket-value">{sale.customerPhone ?? 'Not provided'}</p>

              <p className="surewina-ticket-label">Amount paid (this ticket)</p>
              <p className="surewina-ticket-value">
                {formatNaira(Math.round(sale.amountNgn / sale.quantity))}
              </p>

              <p className="surewina-ticket-note">
                Keep this ticket safe. This reference is required for prize claim
                verification.
              </p>
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