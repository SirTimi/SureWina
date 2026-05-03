import Link from 'next/link';
import { Container, Button, EmptyState } from '@surewina/ui';
import { SearchX } from 'lucide-react';

export default function ResultNotFound() {
  return (
    <Container size="md" className="py-16">
      <EmptyState
        icon={<SearchX className="w-12 h-12" />}
        title="Result not found"
        description="No published result matches this draw code. All draw results are permanent and archived — if you're sure of the code, please check it again."
        action={
          <Link href="/results">
            <Button variant="primary">Browse all results</Button>
          </Link>
        }
      />
    </Container>
  );
}