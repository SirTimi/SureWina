import { Suspense } from 'react';
import { Container } from '@surewina/ui';
import { LookupForm } from '@/components/lookup-form';

interface LookupPageProps {
  searchParams: Promise<{ ref?: string }>;
}

export default async function LookupPage({ searchParams }: LookupPageProps) {
  const params = await searchParams;
  const initialRef = params.ref ?? '';

  return (
    <Container size="md" className="py-12 sm:py-16">
      <div className="text-center mb-8">
        <h1 className="font-display text-4xl font-bold text-ink-950">Check a ticket</h1>
        <p className="text-base text-ink-500 mt-3">
          No account needed. Type your ticket reference to see its draw status.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="bg-white border border-ink-100 rounded-lg p-6 h-32 animate-pulse" />
        }
      >
        <LookupForm initialRef={initialRef} />
      </Suspense>
    </Container>
  );
}