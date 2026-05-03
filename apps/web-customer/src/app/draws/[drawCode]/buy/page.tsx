import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Container } from '@surewina/ui';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate } from '@/lib/draw-helpers';
import { BuyForm } from '@/components/buy-form';
import { BuySummary } from '@/components/buy-summary';

interface BuyPageProps {
  params: Promise<{ drawCode: string }>;
  searchParams: Promise<{ qty?: string }>;
}

export default async function BuyPage({ params, searchParams }: BuyPageProps) {
  const { drawCode } = await params;
  const { qty } = await searchParams;

  let drawData;
  try {
    drawData = await api.draws.getById(drawCode);
  } catch {
    notFound();
  }

  const initialQuantity = Math.max(1, Math.min(100, parseInt(qty ?? '2', 10) || 2));

  return (
    <Container size="lg" className="py-8">
      <nav className="flex items-center gap-2 text-sm text-ink-500 mb-6">
        <Link
          href={`/draws/${drawCode}`}
          className="hover:text-navy-800 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to draw
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-700">
          {drawTypeShortLabel[drawData.draw.drawType]} · {formatDrawDate(drawData.draw.scheduledAt)}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-950 mb-2">Buy your ticket</h1>
          <p className="text-base text-ink-500 mb-8 leading-relaxed">
            Phone is the only thing we need. You&apos;ll get your ticket reference by SMS within
            30 seconds. No account, no password.
          </p>

          <BuyForm draw={drawData.draw} initialQuantity={initialQuantity} />
        </div>

        <div>
          <BuySummary draw={drawData.draw} />
        </div>
      </div>
    </Container>
  );
}