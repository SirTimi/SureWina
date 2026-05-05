import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Container } from '@surewina/ui';
import { OtpForm } from '@/components/otp-form';
import { SignInTrustPanel } from '@/components/sign-in-trust-panel';

interface VerifyPageProps {
  searchParams: Promise<{
    challenge?: string;
    phone?: string;
    next?: string;
    mockOtp?: string;
  }>;
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { challenge, phone, next, mockOtp } = await searchParams;

  if (!challenge || !phone) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="bg-paper py-12 px-6 sm:px-8 lg:px-16 flex items-center">
        <Container size="sm" className="w-full max-w-md mx-0">
          <Suspense
            fallback={
              <div className="h-64 bg-white border border-ink-100 rounded-lg animate-pulse" />
            }
          >
            <OtpForm
              challengeId={challenge}
              phoneE164={phone}
              nextPath={next ?? '/dashboard'}
              mockOtp={mockOtp}
            />
          </Suspense>
        </Container>
      </div>

      <div className="bg-navy-900 py-12 px-6 sm:px-8 lg:px-16 flex items-center text-white hidden lg:flex">
        <SignInTrustPanel />
      </div>
    </div>
  );
}