import { Suspense } from 'react';
import { Container } from '@surewina/ui';
import { SignInForm } from '@/components/sign-in-form';
import { SignInTrustPanel } from '@/components/sign-in-trust-panel';

interface SignInPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { next } = await searchParams;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-28">
      <Container size="lg" className="max-w-[1400px] pb-16">
        <div className="grid min-h-[calc(100vh-8rem)] grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="order-2 lg:order-1">
            <Suspense
              fallback={
                <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]" />
              }
            >
              <SignInForm nextPath={next ?? '/dashboard'} />
            </Suspense>
          </section>

          <section className="order-1 hidden lg:order-2 lg:block">
            <SignInTrustPanel />
          </section>
        </div>
      </Container>
    </main>
  );
}