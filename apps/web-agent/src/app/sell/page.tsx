'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock4, Star, Ticket } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { agentMock, type AgentDrawOption } from '@/lib/agent-mock';
import { writeSaleDraft } from '@/lib/sale-session';

export default function SellPickDrawPage() {
  return (
    <AgentShell>
      {() => <PickDrawBody />}
    </AgentShell>
  );
}

function PickDrawBody() {
  const router = useRouter();
  const draws = agentMock.listDraws();
  const todays = agentMock.todaysDraw();

  const startSale = (draw: AgentDrawOption) => {
    writeSaleDraft({
      drawCode: draw.drawCode,
      drawLabel: draw.prizeDescription,
      ticketPriceNgn: draw.ticketPriceNgn,
      quantity: 1,
      customerPhone: null,
      startedAt: Date.now(),
    });
    router.push('/sell/quantity');
  };

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-10 pt-5">
      <SaleStepper step={1} />

      <SectionHeading
        eyebrow="60-second sale · Step 1 of 3"
        title="Pick a draw"
        description="Today's daily is selected by default. Tap any draw to continue."
        backHref="/"
      />

      <Card className="rounded-3xl border-navy-200 bg-navy-800 p-5 text-white shadow-[0_18px_48px_rgba(14,42,71,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-400">
              Recommended · Today&apos;s daily
            </p>
            <h2 className="mt-2 font-display text-2xl font-black leading-tight">
              {todays.prizeDescription}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {formatNaira(todays.ticketPriceNgn)} per ticket · Cutoff{' '}
              {formatCutoff(todays.cutoffAt)}
            </p>
          </div>
          <Star className="h-6 w-6 text-amber-400" />
        </div>

        <Button
          variant="accent"
          size="lg"
          fullWidth
          onClick={() => startSale(todays)}
          className="mt-5 rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          Use today&apos;s daily
          <ArrowRight className="h-5 w-5" />
        </Button>
      </Card>

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Other open draws
        </p>

        <div className="grid grid-cols-1 gap-2">
          {draws
            .filter((d) => d.drawCode !== todays.drawCode)
            .map((draw) => (
              <button
                key={draw.drawCode}
                type="button"
                onClick={() => startSale(draw)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-navy-200 hover:bg-[#F8FAF4]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                    <Ticket className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-black text-navy-950">
                      {draw.prizeDescription}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock4 className="h-3 w-3" />
                      {formatNaira(draw.ticketPriceNgn)} · cutoff{' '}
                      {formatCutoff(draw.cutoffAt)}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-navy-700" />
              </button>
            ))}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Need help?{' '}
        <Link href="/training" className="font-bold text-navy-700">
          Watch the sale flow video
        </Link>
      </p>
    </main>
  );
}

function formatCutoff(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-NG', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
