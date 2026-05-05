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
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Left: form */}
      <div className="bg-paper py-12 px-6 sm:px-8 lg:px-16 flex items-center">
        <Container size="sm" className="w-full max-w-md mx-0">
          <Suspense
            fallback={
              <div className="h-64 bg-white border border-ink-100 rounded-lg animate-pulse" />
            }
          >
            <SignInForm nextPath={next ?? '/dashboard'} />
          </Suspense>
        </Container>
      </div>

      {/* Right: trust panel */}
      <div className="bg-navy-900 py-12 px-6 sm:px-8 lg:px-16 flex items-center text-white hidden lg:flex">
        <SignInTrustPanel />
      </div>
    </div>
  );
}