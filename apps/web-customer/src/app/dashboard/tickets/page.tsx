import { Suspense } from 'react';
import { Container } from '@surewina/ui';
import { TicketsListView } from '@/components/tickets-list-view';

interface TicketsPageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const { filter } = await searchParams;
  const initialFilter: 'active' | 'past' = filter === 'past' ? 'past' : 'active';

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1200px] py-10">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-navy-700">
            Tickets
          </p>

          <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
            My tickets
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Every ticket you&apos;ve bought, grouped by draw. Active tickets are still in
            play; past tickets stay here for verification.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-white" />
              <div className="h-24 animate-pulse rounded-2xl bg-white" />
              <div className="h-24 animate-pulse rounded-2xl bg-white" />
            </div>
          }
        >
          <TicketsListView initialFilter={initialFilter} />
        </Suspense>
      </Container>
    </main>
  );
}