import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
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
    <main>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(168,227,104,0.42)_0%,rgba(168,227,104,0.24)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#A8E368_100%)] pb-12 pt-32 sm:pt-36 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-[#A8E368]/30 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-[#4E8F01]/10 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <Link
            href={`/draws/${drawCode}`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#4E8F01] transition hover:text-[#3f7601]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to draw
          </Link>

          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-[#4E8F01]/85 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              Secure ticket checkout
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              Buy your
              <br />
              <span className="text-[#4E8F01]">ticket.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Phone is the only thing we need. You&apos;ll get your ticket reference by SMS
              within 30 seconds. No account, no password.
            </p>

            <p className="mt-4 text-sm font-bold text-[#4E8F01]">
              {drawTypeShortLabel[drawData.draw.drawType]} ·{' '}
              {formatDrawDate(drawData.draw.scheduledAt)}
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-10 lg:py-14">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <BuyForm draw={drawData.draw} initialQuantity={initialQuantity} />

            <aside className="self-start lg:sticky lg:top-28">
              <BuySummary draw={drawData.draw} />
            </aside>
          </div>
        </Container>
      </section>
    </main>
  );
}