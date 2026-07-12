import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import { ProcessingPanel } from '@/components/processing-panel';

interface GenericProcessingPageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function GenericProcessingPage({
  searchParams,
}: GenericProcessingPageProps) {
  const { session } = await searchParams;

  if (!session) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32">
        <Container size="sm" className="pb-16">
          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white/95 p-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur"
          >
            <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
              Invalid payment session
            </h1>

            <p className="mt-3 text-slate-500">Start your purchase again.</p>

            <Link href="/draws" className="mt-6 inline-block">
              <Button
                variant="accent"
                size="md"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to draws
              </Button>
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32">
      <Container size="sm" className="pb-16">
        <Suspense
          fallback={
            <div className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.10)]" />
          }
        >
          <ProcessingPanel sessionId={session} />
        </Suspense>
      </Container>
    </main>
  );
}