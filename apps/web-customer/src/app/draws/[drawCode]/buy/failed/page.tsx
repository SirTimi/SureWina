import Link from 'next/link';
import { AlertCircle, ArrowLeft, RotateCw, ShieldCheck } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';

interface FailedPageProps {
  params: Promise<{ drawCode: string }>;
  searchParams: Promise<{ session?: string; reason?: string }>;
}

export default async function FailedPage({ params, searchParams }: FailedPageProps) {
  const { drawCode } = await params;
  const { reason } = await searchParams;

  const reasonLabel: Record<string, string> = {
    declined: 'Your card was declined by your bank.',
    insufficient: 'Insufficient funds.',
    timeout: 'The payment took too long to confirm.',
    cancelled: 'You cancelled the payment.',
  };

  const message = reason
    ? reasonLabel[reason] ?? 'Something went wrong with your payment.'
    : 'Your payment did not go through.';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(249,203,11,0.18)_0%,rgba(249,203,11,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#F2F5FB_100%)] pt-32">
      <Container size="sm" className="pb-16">
        <Card
          variant="default"
          className="overflow-hidden rounded-3xl border-slate-200 bg-white/95 p-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-9 w-9 text-red-600" />
          </div>

          <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white">
            <ShieldCheck className="h-4 w-4" />
            No ticket issued
          </div>

          <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
            Payment didn&apos;t complete.
          </h1>

          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-500">
            {message}
          </p>

          <div className="mt-7 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-5 text-left">
            <p className="mb-3 text-sm font-black text-navy-950">Don&apos;t worry:</p>

            <ul className="space-y-2 text-sm leading-relaxed text-slate-600">
              <SafeItem>You haven&apos;t been charged. Failed payments are not held.</SafeItem>
              <SafeItem>No ticket was issued. Your slot wasn&apos;t consumed.</SafeItem>
              <SafeItem>Try again with a different payment method or card.</SafeItem>
            </ul>
          </div>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={`/draws/${drawCode}/buy`}>
              <Button
                variant="accent"
                size="md"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
              >
                <RotateCw className="h-4 w-4" />
                Try again
              </Button>
            </Link>

            <Link href={`/draws/${drawCode}`}>
              <Button
                variant="secondary"
                size="md"
                className="rounded-sm border-navy-200 bg-white font-bold text-navy-700 hover:bg-amber-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to draw
              </Button>
            </Link>
          </div>

          <p className="mt-7 text-xs text-slate-500">
            Stuck? Email{' '}
            <a href="mailto:help@surewina.ng" className="font-bold text-navy-700 underline">
              help@surewina.ng
            </a>{' '}
            or call <span className="font-mono font-bold text-navy-950">0700-SUREWINA</span>.
          </p>
        </Card>
      </Container>
    </main>
  );
}

function SafeItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 font-black text-navy-700">✓</span>
      <span>{children}</span>
    </li>
  );
}