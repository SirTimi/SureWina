import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
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
      <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(168,227,104,0.42)_0%,rgba(168,227,104,0.24)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#A8E368_100%)] pt-32">
        <Container size="sm" className="pb-16">
          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white/95 p-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur"
          >
            <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
              Invalid payment session
            </h1>

            <p className="mt-3 text-slate-500">Start your purchase again.</p>

            <Link href={`/draws/${drawCode}/buy`} className="mt-6 inline-block">
              <Button
                variant="accent"
                size="md"
                className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to checkout
              </Button>
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(168,227,104,0.42)_0%,rgba(168,227,104,0.24)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#A8E368_100%)] pt-32">
      <Container size="sm" className="pb-16">
        <Suspense
          fallback={
            <div className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.10)]" />
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
    </main>
  );
}