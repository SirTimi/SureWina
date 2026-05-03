import Link from 'next/link';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';

interface FailedPageProps {
  params: Promise<{ drawCode: string }>;
  searchParams: Promise<{ session?: string; reason?: string }>;
}

export default async function FailedPage({ params, searchParams }: FailedPageProps) {
  const { drawCode } = await params;
  const { reason } = await searchParams;

  const reasonLabel: Record<string, string> = {
    declined: 'Your card was declined by your bank',
    insufficient: 'Insufficient funds',
    timeout: 'The payment took too long to confirm',
    cancelled: 'You cancelled the payment',
  };

  const message = reason ? reasonLabel[reason] ?? 'Something went wrong with your payment.' : 'Your payment did not go through.';

  return (
    <Container size="sm" className="py-16">
      <Card variant="default" className="p-8 sm:p-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-danger-bg mb-5">
          <AlertCircle className="w-7 h-7 text-danger" />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink-950">Payment didn&apos;t complete</h1>
        <p className="text-ink-500 mt-3 leading-relaxed">{message}</p>

        <div className="bg-ink-50 border border-ink-100 rounded-md p-4 mt-6 text-left">
          <p className="text-sm font-semibold text-ink-950 mb-2">Don&apos;t worry:</p>
          <ul className="text-sm text-ink-700 space-y-1.5 leading-relaxed">
            <li className="flex gap-2">
              <span className="text-success font-bold flex-shrink-0">✓</span>
              <span>You haven&apos;t been charged. Failed payments are not held.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-success font-bold flex-shrink-0">✓</span>
              <span>No ticket was issued. Your slot wasn&apos;t consumed.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-success font-bold flex-shrink-0">✓</span>
              <span>Try again with a different payment method or card.</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
          <Link href={`/draws/${drawCode}/buy`}>
            <Button variant="accent" size="md">
              <RotateCw className="w-4 h-4" />
              Try again
            </Button>
          </Link>
          <Link href={`/draws/${drawCode}`}>
            <Button variant="secondary" size="md">
              Back to draw
            </Button>
          </Link>
        </div>

        <p className="text-xs text-ink-500 mt-6">
          Stuck? Email{' '}
          <a href="mailto:help@surewina.ng" className="underline hover:text-navy-700">
            help@surewina.ng
          </a>{' '}
          or call{' '}
          <span className="font-mono">0700-SUREWINA</span>.
        </p>
      </Card>
    </Container>
  );
}