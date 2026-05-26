'use client';

import { useState } from 'react';
import type { DrawPublic } from '@surewina/types';
import { BuyForm } from '@/components/buy-form';
import { BuySummary } from '@/components/buy-summary';

interface BuyCheckoutClientProps {
  draw: DrawPublic;
  initialQuantity: number;
}

export function BuyCheckoutClient({ draw, initialQuantity }: BuyCheckoutClientProps) {
  const [quantity, setQuantity] = useState(initialQuantity);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <BuyForm
        draw={draw}
        initialQuantity={initialQuantity}
        onQuantityChange={setQuantity}
      />

      <aside className="self-start lg:sticky lg:top-28">
        <BuySummary draw={draw} quantity={quantity} />
      </aside>
    </div>
  );
}
