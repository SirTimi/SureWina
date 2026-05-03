'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Lock } from 'lucide-react';
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
    <Card variant="default" className="p-6 sticky top-6">
      <h2 className="font-display font-semibold text-xl text-ink-950">Buy a ticket</h2>
      <p className="text-sm text-ink-500 mt-1">
        You&apos;ll get a unique ticket reference by SMS within 30 seconds.
      </p>

      <div className="mt-5">
        <label className="block text-sm font-medium text-ink-700 mb-2">
          How many tickets?
        </label>
        <div className="flex items-stretch border border-ink-200 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-4 bg-ink-50 hover:bg-ink-100 transition-colors"
            aria-label="Decrease quantity"
          >
            <Minus className="w-4 h-4 text-ink-700" />
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="flex-1 text-center font-display text-lg font-semibold tabular-nums bg-white outline-none"
            min={1}
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="px-4 bg-ink-50 hover:bg-ink-100 transition-colors"
            aria-label="Increase quantity"
          >
            <Plus className="w-4 h-4 text-ink-700" />
          </button>
        </div>
        {ticketsToNextEntry !== null && ticketsToNextEntry < 10 && (
          <p className="text-xs text-amber-700 mt-2">
            {ticketsToNextEntry} more for a free Saturday jackpot entry
          </p>
        )}
      </div>

      <div className="mt-5 pt-5 border-t border-ink-100 flex items-baseline justify-between">
        <span className="text-sm text-ink-500">Total</span>
        <span className="font-display text-2xl font-bold text-ink-950 tabular-nums">
          {formatNaira(total)}
        </span>
      </div>

      <Link href={`/draws/${draw.drawCode}/buy?qty=${quantity}`} className="block mt-5">
        <Button variant="accent" size="lg" fullWidth>
          Continue to checkout
        </Button>
      </Link>

      <p className="text-xs text-ink-500 mt-3 flex items-start gap-1.5">
        <Lock className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          By continuing you confirm you are 18 or older and accept the{' '}
          <Link href="/terms" className="underline hover:text-navy-700">
            raffle rules
          </Link>
          .
        </span>
      </p>
    </Card>
  );
}