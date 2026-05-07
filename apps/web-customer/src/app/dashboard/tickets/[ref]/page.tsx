import { Container } from '@surewina/ui';
import { TicketDetailView } from '@/components/ticket-detail-view';

interface TicketDetailPageProps {
  params: Promise<{ ref: string }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { ref } = await params;

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1200px] py-10">
        <TicketDetailView ticketRef={ref} />
      </Container>
    </main>
  );
}