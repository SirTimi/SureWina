import Link from 'next/link';
import { Container, Button, EmptyState } from '@surewina/ui';
import { SearchX } from 'lucide-react';

export default function DrawNotFound() {
  return (
    <Container size="md" className="py-16">
      <EmptyState
        icon={<SearchX className="w-12 h-12" />}
        title="Draw not found"
        description="This draw code doesn't match any active or past draw. It may have been removed, or the link is incorrect."
        action={
          <Link href="/">
            <Button variant="primary">Back to active draws</Button>
          </Link>
        }
      />
    </Container>
  );
}