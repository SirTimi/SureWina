import { Suspense } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Container } from '@surewina/ui';
import { LookupForm } from '@/components/lookup-form';

interface LookupPageProps {
  searchParams: Promise<{ ref?: string }>;
}

export default async function LookupPage({ searchParams }: LookupPageProps) {
  const params = await searchParams;
  const initialRef = params.ref ?? '';

  return (
    <>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(249,203,11,0.18)_0%,rgba(249,203,11,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#F2F5FB_100%)] pb-20 pt-32 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-white" />
              Instant ticket verification
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              Check your
              <br />
              <span className="text-navy-700">ticket status.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              No account needed. Enter your ticket reference to confirm the draw, ticket
              status, face value, and whether it is still awaiting draw or already closed.
            </p>
          </div>
        </Container>
      </section>

      <Container size="lg" className="max-w-[1400px] py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Suspense
            fallback={
              <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]" />
            }
          >
            <LookupForm initialRef={initialRef} />
          </Suspense>

          <aside className="self-start rounded-2xl border border-navy-100 bg-[#F8FAF4] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              Where to find it
            </p>

            <h2 className="mt-3 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
              Your ticket reference is in your SMS receipt.
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Ticket references usually look like{' '}
              <span className="font-mono font-bold text-navy-950">SW-XXXX-XXXX</span>.
              Copy it exactly from your SMS or ticket confirmation page.
            </p>

            <div className="mt-5 rounded-xl border border-navy-100 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Example
              </p>
              <p className="mt-2 font-mono text-lg font-black text-navy-700">
                SW-04AB-9LK2
              </p>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              We never show winner names publicly. Results use ticket references, draw
              timestamps, and verification records.
            </p>
          </aside>
        </div>
      </Container>
    </>
  );
}