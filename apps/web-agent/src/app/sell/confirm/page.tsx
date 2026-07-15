'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Ticket, WifiOff } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { clearSaleDraft, readSaleDraft, type SaleDraft } from '@/lib/sale-session';
import { enqueueSale, isOnline } from '@/lib/offline-queue';
import { api } from '@/lib/api';

export default function SellConfirmPage() {
  return (
    <AgentShell>
      {() => <ConfirmBody />}
    </AgentShell>
  );
}

function ConfirmBody() {
  const router = useRouter();
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const current = readSaleDraft();
    if (!current) {
      router.replace('/sell');
      return;
    }
    setDraft(current);
    setOnline(isOnline());

    const sync = () => setOnline(isOnline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);

    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - current.startedAt) / 1000));
    }, 1000);

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      clearInterval(tick);
    };
  }, [router]);

  if (!draft) return null;

  const total = draft.quantity * draft.ticketPriceNgn;
  const commission = Math.round(total * 0.1);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);

    try {
      if (!isOnline()) {
        const ref = `SW-PEND-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        enqueueSale({
          queueId: `q_${Math.random().toString(36).slice(2, 10)}`,
          drawCode: draft.drawCode,
          quantity: draft.quantity,
          customerPhone: draft.customerPhone,
          stateOfPlayCode: draft.stateOfPlayCode,
          ticketRef: ref,
          queuedAt: new Date().toISOString(),
        });
        clearSaleDraft();
        router.push(`/sell/done/${ref}?queued=1`);
        return;
      }

      const result = await api.agents.sell({
        drawCode: draft.drawCode,
        quantity: draft.quantity,
        stateOfPlayCode: draft.stateOfPlayCode,
        customerPhone: draft.customerPhone ?? undefined,
      });
      clearSaleDraft();
      const q = new URLSearchParams({
        amount: String(result.amountNgn),
        qty: String(result.quantity),
        kind: draft.ticketKind,
        label: draft.drawLabel,
        phone: draft.customerPhone ?? '',
        notified: result.customerNotified ? '1' : '0',
        tickets: result.ticketRefs.join(','),
      });
      router.push(`/sell/done/${result.saleReference}?${q.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sale.');
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SaleStepper step={3} />

      <SectionHeading
        eyebrow="60-second sale · Step 3 of 3"
        title="Confirm the sale"
        description="Take cash from the customer, then tap confirm."
        backHref="/sell/quantity"
        rightSlot={
          <div className="rounded-sm border border-slate-200 bg-[#F8FAF4] px-3 py-1.5 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Elapsed
            </p>
            <p className="font-mono text-sm font-black text-navy-950 tabular-nums">
              {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
              {String(elapsed % 60).padStart(2, '0')}
            </p>
          </div>
        }
      />

      {!online && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-bold">You&apos;re offline.</p>
            <p className="text-xs text-amber-800/80">
              The sale will be queued and synced once you&apos;re back online. The customer
              still gets a temporary reference now.
            </p>
          </div>
        </div>
      )}

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <Ticket className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Draw
            </p>
            <p className="mt-1 truncate font-display text-base font-black text-navy-950">
              {draft.drawLabel}
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <Row label="Quantity" value={`${draft.quantity} ticket${draft.quantity > 1 ? 's' : ''}`} />
          <Row label="Customer phone" value={draft.customerPhone ?? 'Not provided'} />
          <Row label="Ticket price" value={formatNaira(draft.ticketPriceNgn)} />
          <Row label="Your commission" value={formatNaira(commission)} hint="10% (Silver tier)" />
        </div>

        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
            Total to collect
          </p>
          <p className="mt-1 font-display text-4xl font-black text-navy-950 tabular-nums">
            {formatNaira(total)}
          </p>
        </div>
      </Card>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="sticky bottom-3 mt-5 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.04)]">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          isLoading={submitting}
          disabled={submitting}
          onClick={confirm}
          className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          <CheckCircle2 className="h-5 w-5" />
          Confirm sale · {formatNaira(total)}
        </Button>
      </div>
    </main>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="text-right">
        <p className="font-display text-sm font-black text-navy-950">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}