import { Container } from '@surewina/ui';
import { ClaimsListView } from '@/components/claims-list-view';

export default function ClaimsPage() {
  return (
    <Container size="lg" className="py-10">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink-950">My claims</h1>
        <p className="text-base text-ink-500 mt-2">
          Every prize you&apos;ve ever won, current pipeline status, fulfilment timeline, and
          history.
        </p>
      </div>

      <ClaimsListView />
    </Container>
  );
}