import { Suspense } from 'react';
import { Container } from '@surewina/ui';
import { ProcessingPanel } from '@/components/processing-panel';

interface ProcessingPageProps {
  params: Promise<{ drawCode: string }>;
  searchParams: Promise<{
    session?: string;
    qty?: string;
    phone?: string;
  }>;
}

export default async function ProcessingPage({ params, searchParams }: ProcessingPageProps) {
  const { drawCode } = await params;
  const { session, qty, phone } = await searchParams;

  if (!session || !qty || !phone) {
    return (
      <Container size="md" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-ink-950">Invalid payment session</h1>
        <p className="text-ink-500 mt-2">Start your purchase again.</p>
      </Container>
    );
  }

  return (
    <Container size="sm" className="py-16">
      <Suspense
        fallback={
          <div className="bg-white border border-ink-100 rounded-lg p-8 h-64 animate-pulse" />
        }
      >
        <ProcessingPanel
          drawCode={drawCode}
          sessionId={session}
          quantity={parseInt(qty, 10)}
          phoneE164={decodeURIComponent(phone)}
        />
      </Suspense>
    </Container>
  );
}