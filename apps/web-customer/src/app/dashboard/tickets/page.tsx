import { Container } from '@surewina/ui';
import { TicketsListView } from '@/components/tickets-list-view';

interface TicketsPageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const { filter } = await searchParams;
  const initialFilter: 'active' | 'past' = filter === 'past' ? 'past' : 'active';

  return (
    <Container size="lg" className="py-10">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink-950">My tickets</h1>
        <p className="text-base text-ink-500 mt-2">
          Every ticket you&apos;ve bought, grouped by draw. Active tickets are still in play.
        </p>
      </div>

      <TicketsListView initialFilter={initialFilter} />
    </Container>
  );
}