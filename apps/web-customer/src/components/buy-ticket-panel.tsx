'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, Minus, Plus, Ticket } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';

interface BuyTicketPanelProps {
  draw: DrawPublic;
}

export function BuyTicketPanel({ draw }: BuyTicketPanelProps) {
  const [quantity, setQuantity] = useState(2);
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const total = quantity * draw.ticketPriceNgn;
  const ticketsToNextEntry = isJackpot ? null : 10 - (quantity % 10);

  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur"
    >
      <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white">
        <Ticket className="h-4 w-4" />
        Secure checkout
      </div>

      <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
        Buy tickets
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        You&apos;ll get a unique ticket reference by SMS within 30 seconds.
      </p>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-black text-navy-950">
          How many tickets?
        </label>

        <div className="flex overflow-hidden rounded-sm border border-slate-200 bg-white transition focus-within:border-navy-700 focus-within:ring-2 focus-within:ring-amber-400/35">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-4 text-navy-700 transition hover:bg-amber-50"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>

          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="h-12 flex-1 bg-white text-center font-display text-xl font-black tabular-nums text-navy-950 outline-none"
            min={1}
          />

          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="px-4 text-navy-700 transition hover:bg-amber-50"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {ticketsToNextEntry !== null && ticketsToNextEntry < 10 && (
          <p className="mt-2 text-xs font-semibold text-navy-700">
            {ticketsToNextEntry} more for a free Saturday jackpot entry
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-slate-500">Total</span>
          <span className="font-display text-3xl font-black text-navy-950 tabular-nums">
            {formatNaira(total)}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {quantity.toLocaleString()} ticket{quantity === 1 ? '' : 's'} ×{' '}
          {formatNaira(draw.ticketPriceNgn)}
        </p>
      </div>

      <Link href={`/draws/${draw.drawCode}/buy?qty=${quantity}`} className="mt-5 block">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          Continue to checkout
        </Button>
      </Link>

      <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-navy-700" />
        <span>
          By continuing you confirm you are 18 or older and accept the{' '}
          <Link href="/terms" className="font-bold text-navy-700 underline">
            raffle rules
          </Link>
          .
        </span>
      </p>
    </Card>
  );
}