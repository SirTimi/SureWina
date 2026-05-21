'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Minus, Phone, Plus, Ticket } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SaleStepper } from '@/components/sale-stepper';
import { SectionHeading } from '@/components/section-heading';
import { patchSaleDraft, readSaleDraft, type SaleDraft } from '@/lib/sale-session';

const PRESET_QUANTITIES = [1, 2, 5, 10];

export default function SellQuantityPage() {
  return (
    <AgentShell>
      {() => <QuantityBody />}
    </AgentShell>
  );
}

function QuantityBody() {
  const router = useRouter();
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    const current = readSaleDraft();
    if (!current) {
      router.replace('/sell');
      return;
    }
    setDraft(current);
    setQuantity(current.quantity);
    setPhone(current.customerPhone ?? '');
  }, [router]);

  if (!draft) return null;

  const total = quantity * draft.ticketPriceNgn;

  const validatePhone = (raw: string): { ok: boolean; e164: string | null } => {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, e164: null };
    const cleaned = trimmed.replace(/\s+/g, '').replace(/-/g, '');
    if (/^\+234\d{10}$/.test(cleaned)) return { ok: true, e164: cleaned };
    if (/^0\d{10}$/.test(cleaned)) return { ok: true, e164: `+234${cleaned.slice(1)}` };
    if (/^234\d{10}$/.test(cleaned)) return { ok: true, e164: `+${cleaned}` };
    return { ok: false, e164: null };
  };

  const next = () => {
    const validation = validatePhone(phone);
    if (!validation.ok || !validation.e164) {
      setPhoneError('Enter the customer phone number. Every ticket sale must have a valid Nigerian phone number.');
      return;
    }
    patchSaleDraft({ quantity, customerPhone: validation.e164 });
    router.push('/sell/confirm');
  };

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SaleStepper step={2} />

      <SectionHeading
        eyebrow="60-second sale · Step 2 of 3"
        title="How many tickets?"
        description="Tap a preset, or use + / − to fine-tune."
        backHref="/sell"
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
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
            <p className="mt-0.5 text-xs text-slate-500">
              {formatNaira(draft.ticketPriceNgn)} per ticket
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {PRESET_QUANTITIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuantity(q)}
              className={
                quantity === q
                  ? 'rounded-2xl border-2 border-navy-700 bg-amber-50 py-3 text-base font-black text-navy-950'
                  : 'rounded-2xl border border-slate-200 bg-white py-3 text-base font-bold text-slate-700 hover:border-navy-200'
              }
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-navy-50 p-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-12 w-12 items-center justify-center rounded-sm border border-slate-200 bg-white text-navy-950 disabled:opacity-30"
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="h-5 w-5" />
          </button>

          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Quantity
            </p>
            <p className="font-display text-3xl font-black text-navy-950 tabular-nums">
              {quantity}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            className="flex h-12 w-12 items-center justify-center rounded-sm bg-navy-800 text-white"
            aria-label="Increase quantity"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <label
            htmlFor="customer-phone"
            className="mb-2 flex items-center justify-between text-sm font-bold text-navy-950"
          >
            Customer phone <span className="text-xs font-black text-red-600">Required</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="customer-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(null);
              }}
              placeholder="080… or +234…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-base font-bold text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
            />
          </div>
          {phoneError && (
            <p className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {phoneError}
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Phone number is required because it is used to confirm the player and process any payout.
          </p>
        </div>
      </Card>

      <div className="sticky bottom-3 mt-5 rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Total
          </p>
          <p className="font-display text-2xl font-black text-navy-950">
            {formatNaira(total)}
          </p>
        </div>
        <Button
          variant="accent"
          size="lg"
          fullWidth
          onClick={next}
          className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          Continue
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </main>
  );
}
