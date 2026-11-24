'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, Gift, Trophy } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { AgentMe } from '@surewina/types';
import type { SurewinaTicketOffer } from '@surewina/types';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { writeSaleDraft } from '@/lib/sale-session';
import { api } from '@/lib/api';

export default function SellPickDrawPage() {
  return (
    <AgentShell>
      {(agent) => <TicketOptionBody agent={agent} />}
    </AgentShell>
  );
}

function TicketOptionBody({ agent }: { agent: AgentMe }) {
  const router = useRouter();
  const [offers, setOffers] = useState<SurewinaTicketOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.agents
      .activeDraws()
      .then((res) => {
        if (!active) return;
        setOffers(
          res.draws.map((d) => ({
            kind: d.drawType === 'SATURDAY_JACKPOT' ? 'JACKPOT' : 'DAILY',
            drawCode: d.drawCode,
            // Product draws carry their own name, e.g. "SURE 100 · 12:00".
            drawName: d.productName
              ? d.drawName
              : d.drawType === 'SATURDAY_JACKPOT' ? 'Sure Jackpot' : "Today's draw",
            ticketPriceNgn: d.ticketPriceNgn,
            scheduledAt: d.scheduledAt,
            cutoffAt: d.cutoffAt,
            description: d.productName
              ? d.prizeDescription
              : d.drawType === 'SATURDAY_JACKPOT'
                ? 'Direct entry into the coming Saturday jackpot.'
                : "Regular entry into today's named Surewina draw.",
          })),
        );
      })
      .catch(() => {
        if (active) setOffers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Every open draw: each daily product for the current slot, and the jackpots.
  const dailyOffers = offers.filter((offer) => offer.kind === 'DAILY');
  const jackpotOffers = offers.filter((offer) => offer.kind === 'JACKPOT');

  const startSale = (offer: SurewinaTicketOffer) => {
    writeSaleDraft({
      drawCode: offer.drawCode,
      drawLabel: offer.drawName,
      ticketKind: offer.kind,
      ticketPriceNgn: offer.ticketPriceNgn,
      quantity: 1,
      customerPhone: null,
      stateOfPlayCode: agent.registeredStateCode,
      startedAt: Date.now(),
    });

    router.push('/sell/quantity');
  };

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-10 pt-5">
      <SaleStepper step={1} />

      <SectionHeading
        eyebrow="60-second sale · Step 1 of 3"
        title="Choose ticket type"
        description="Pick the product the customer wants. Each draw closes for sale automatically at its cutoff."
        backHref="/"
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-64 animate-pulse rounded-3xl bg-white" />
          <div className="h-64 animate-pulse rounded-3xl bg-white" />
        </div>
      ) : offers.length === 0 ? (
        <Card className="rounded-3xl border-navy-100 bg-white p-8 text-center shadow-sm">
          <p className="font-display text-xl font-black text-navy-950">
            No draws are open right now.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Check back shortly — a new draw opens for sale automatically.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dailyOffers.map((offer) => (
            <TicketOptionCard
              key={offer.drawCode}
              offer={offer}
              icon={<Gift className="h-6 w-6" />}
              label="Daily draw"
              cta={`Sell ${formatNaira(offer.ticketPriceNgn)} ticket`}
              onSelect={() => startSale(offer)}
            />
          ))}

          {jackpotOffers.map((offer) => (
            <TicketOptionCard
              key={offer.drawCode}
              offer={offer}
              icon={<Trophy className="h-6 w-6" />}
              label="Jackpot"
              cta={`Sell ${formatNaira(offer.ticketPriceNgn)} jackpot ticket`}
              onSelect={() => startSale(offer)}
              featured
            />
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-navy-100 bg-navy-50 p-4 text-sm leading-relaxed text-slate-600">
        Regular tickets enter today’s named draw. Each 10 regular tickets in the
        active jackpot cycle may unlock an optional ₦500 jackpot ticket offer
        for an identified customer phone number.
      </div>
    </main>
  );
}

function TicketOptionCard({
  offer,
  icon,
  label,
  cta,
  onSelect,
  featured = false,
}: {
  offer: SurewinaTicketOffer;
  icon: React.ReactNode;
  label: string;
  cta: string;
  onSelect: () => void;
  featured?: boolean;
}) {
  return (
    <Card
      className={
        featured
          ? 'rounded-3xl border-amber-200 bg-amber-50 p-5 shadow-sm'
          : 'rounded-3xl border-navy-100 bg-white p-5 shadow-sm'
      }
    >
      <div
        className={
          featured
            ? 'mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-navy-950'
            : 'mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700'
        }
      >
        {icon}
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>

      <h2 className="mt-2 font-display text-2xl font-black leading-tight text-navy-950">
        {offer.drawName}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-500">{offer.description}</p>

      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
        <CalendarClock className="h-4 w-4 text-navy-700" />
        Cutoff {formatCutoff(offer.cutoffAt)}
      </div>

      <Button
        variant="accent"
        size="lg"
        fullWidth
        onClick={onSelect}
        className="mt-5 rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
      >
        {cta}
        <span className="font-mono">{formatNaira(offer.ticketPriceNgn)}</span>
        <ArrowRight className="h-5 w-5" />
      </Button>
    </Card>
  );
}

function formatCutoff(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}