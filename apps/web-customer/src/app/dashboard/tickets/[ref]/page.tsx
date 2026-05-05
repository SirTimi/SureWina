import { Container } from '@surewina/ui';
import { TicketDetailView } from '@/components/ticket-detail-view';

interface TicketDetailPageProps {
  params: Promise<{ ref: string }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { ref } = await params;

  return (
    <Container size="md" className="py-10">
      <TicketDetailView ticketRef={ref} />
    </Container>
  );
}