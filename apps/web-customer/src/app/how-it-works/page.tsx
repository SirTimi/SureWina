import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';

export default async function HowItWorksPage() {
  const { draws } = await api.draws.listActive();
  const dailyDraw = draws.find((d) => d.drawType === 'DAILY_STANDARD');

  return (
    <>
      {/* Hero */}
<section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(249,203,11,0.18)_0%,rgba(249,203,11,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#F2F5FB_100%)] pt-32 pb-18 sm:pt-36 sm:pb-24 lg:pt-25 lg:pb-28">
  <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
  <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

  <Container size="lg" className="relative max-w-[1400px]">
    <div className="max-w-4xl">
      <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
        <ShieldCheck className="h-4 w-4 text-white" />
        Regulated, audited, and provable
      </div>

      <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
        How Surewina
        <br />
        <span className="text-navy-700">works</span>
      </h1>

      <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
        Buy a ticket. Wait for the draw. Win or don&apos;t. Every step is regulated,
        audited, and provable.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {dailyDraw && (
          <Link href={`/draws/${dailyDraw.drawCode}`}>
            <Button
              variant="accent"
              size="lg"
              className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 shadow-[0_16px_34px_rgba(1,58,168,0.18)] hover:!border-transparent hover:bg-amber-400"
            >
              Buy a ticket for {formatNaira(dailyDraw.ticketPriceNgn)}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}

        <Link href="/audit">
          <Button
            variant="secondary"
            size="lg"
            className="rounded-sm border-navy-200 bg-white/90 font-bold text-navy-700 shadow-sm backdrop-blur hover:bg-white"
          >
            See audit method
          </Button>
        </Link>
      </div>
    </div>
  </Container>
</section>
      {/* 4 steps */}
      <Container size="lg" className="max-w-[1400px] py-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StepCard
            number="01"
            title="Buy a ticket"
            description={`Daily ticket is ${formatNaira(500)}. Saturday jackpot ticket is ${formatNaira(5000)}. Pay with card, transfer, USSD, or wallet.`}
          />
          <StepCard
            number="02"
            title="Get an SMS"
            description="Within 30 seconds your unique ticket reference arrives by SMS. Keep it."
          />
          <StepCard
            number="03"
            title="Watch the draw"
            description="Daily draws at 20:00 WAT. Saturday jackpot at 21:00. RNG seed is published before the draw."
          />
          <StepCard
            number="04"
            title="Get paid"
            description="Cash prizes hit your bank in 24h. Product prizes ship within 3 working days, anywhere in Nigeria."
          />
        </div>
      </Container>

      {/* Why our draws can't be rigged */}
      <section className="my-10 border-y border-navy-100 bg-[#F8FAF4] py-16 sm:py-20">
        <Container size="lg" className="max-w-[1400px]">
          <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] lg:grid-cols-[0.95fr_1.05fr]">
            <div className="p-8 sm:p-12">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                Verifiable RNG
              </p>

              <h2 className="font-display text-3xl font-black leading-tight tracking-[-0.03em] text-navy-950 sm:text-4xl">
                Why our draws can&apos;t be rigged
              </h2>

              <ol className="mt-7 space-y-5 text-base leading-relaxed text-slate-600">
                <li>
                  <span className="font-black text-navy-950">Before the draw:</span> we
                  generate a random seed and publish its SHA-256 hash on this site before
                  the draw.
                </li>
                <li>
                  <span className="font-black text-navy-950">During the draw:</span>{' '}
                  ticket numbers are sorted, the seed is fed to a deterministic RNG, and
                  the winning index is picked.
                </li>
                <li>
                  <span className="font-black text-navy-950">After the draw:</span> the
                  original seed is revealed. Anyone can hash it and confirm it matches
                  what we published.
                </li>
              </ol>

              <Link
                href="/audit"
                className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
              >
                Read the full audit method <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="bg-navy-800 p-8 sm:p-12">
              <pre className="w-full overflow-x-auto rounded-2xl border border-white/15 bg-white/10 p-6 font-mono text-xs leading-relaxed text-white/90 backdrop-blur sm:text-sm">
                <span className="text-white/50"># 02 May 2026 · 00:00 WAT</span>
                {'\n'}
                seed_commit:{'\n'}
                <span className="text-amber-400">9f4c2b8e1a7d6f30c5e9b2148a6d4f7c</span>
                {'\n\n'}
                <span className="text-white/50"># 02 May 2026 · 20:00 WAT</span>
                {'\n'}
                tickets_sold: <span className="text-white">5,841</span>
                {'\n'}
                winning_index: <span className="text-white">2,194</span>
                {'\n'}
                winning_ticket: <span className="text-amber-400">SW-04AB-9LK2</span>
                {'\n\n'}
                <span className="text-white/50"># 02 May 2026 · 20:01 WAT</span>
                {'\n'}
                seed_reveal:{'\n'}
                <span className="text-amber-400">4a1f...verified ✓</span>
              </pre>
            </div>
          </div>
        </Container>
      </section>

      {/* What happens if you win */}
      <Container size="lg" className="max-w-[1400px] py-12">
        <h2 className="mb-6 font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
          What happens if you win
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <WinnerCard
            label="Product prize"
            title="We ship it to you"
            items={[
              'No verification needed beyond confirming your collection point',
              'Dispatched within 5 business days of confirmation',
              'Tracking reference sent by SMS',
              'Brand new, sealed, manufacturer warranty',
            ]}
          />

          <WinnerCard
            label="Cash option"
            title="We pay your bank account"
            items={[
              'Tier 1 KYC required (ID + selfie + bank account)',
              '10% withholding tax deducted at source on prizes over ₦10,000',
              'Bank transfer initiated within 48–72 hours of KYC clearance',
              'WHT certificate generated automatically',
            ]}
          />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          You have 7 days from the draw to choose between product and cash. If you
          don&apos;t choose, the prize defaults to product fulfilment.
        </p>
      </Container>

      {/* CTA strip */}
      <Container size="lg" className="max-w-[1400px] pb-16">
        <Card
          variant="default"
          className="overflow-hidden rounded-3xl border border-navy-200 bg-navy-800 p-10 text-center text-white shadow-[0_24px_70px_rgba(1,58,168,0.18)] sm:p-12"
        >
          <h2 className="font-display text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
            Ready to play?
          </h2>

          {dailyDraw && (
            <p className="mb-6 mt-3 text-base text-white/75">
              One ticket is {formatNaira(dailyDraw.ticketPriceNgn)}. Today&apos;s draw
              closes in <span className="font-mono text-amber-400">6 hours</span>.
            </p>
          )}

          {dailyDraw && (
            <Link href={`/draws/${dailyDraw.drawCode}`}>
              <Button
                variant="accent"
                size="lg"
                className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
              >
                Buy a ticket for {formatNaira(dailyDraw.ticketPriceNgn)}
              </Button>
            </Link>
          )}
        </Card>
      </Container>
    </>
  );
}

interface StepCardProps {
  number: string;
  title: string;
  description: string;
}

function StepCard({ number, title, description }: StepCardProps) {
  return (
    <Card
      variant="default"
      className="group min-h-[210px] rounded-2xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:border-amber-500/60"
    >
      <p className="mb-4 font-display text-3xl font-black tabular-nums text-navy-700">
        {number}
      </p>
      <h3 className="mb-2 font-display text-base font-black text-navy-950">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-slate-500">{description}</p>
    </Card>
  );
}

interface WinnerCardProps {
  label: string;
  title: string;
  items: string[];
}

function WinnerCard({ label, title, items }: WinnerCardProps) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
        {label}
      </p>

      <h3 className="mb-4 font-display text-xl font-black text-navy-950">{title}</h3>

      <ul className="space-y-2 text-sm leading-relaxed text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}