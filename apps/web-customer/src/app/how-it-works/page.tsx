import Link from 'next/link';
import { Button, Card, Container, Badge } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';

export default async function HowItWorksPage() {
  const { draws } = await api.draws.listActive();
  const dailyDraw = draws.find((d) => d.drawType === 'DAILY_STANDARD');

  return (
    <>
      {/* Hero */}
      <Container size="md" className="py-16 text-center">
        <Badge variant="success" className="mb-6">
          No catches · plain English
        </Badge>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink-950 leading-tight">
          How Surewina works
        </h1>
        <p className="text-base sm:text-lg text-ink-500 mt-4 max-w-2xl mx-auto leading-relaxed">
          Buy a ticket. Wait for the draw. Win or don&apos;t. Every step is regulated, audited,
          and provable.
        </p>
      </Container>

      {/* 4 steps */}
      <Container size="lg" className="pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StepCard
            number="01"
            title="Buy a ticket"
            description={`Daily ticket is ${formatNaira(500)}. Saturday jackpot ticket is ${formatNaira(5000)}. Pay with card, transfer, USSD, or wallet.`}
          />
          <StepCard
            number="02"
            title="Get an SMS"
            description="Within 30 seconds your unique ticket reference (SW-XXXX-XXXX) arrives by SMS. Keep it."
          />
          <StepCard
            number="03"
            title="Watch the draw"
            description="Daily draws at 20:00 WAT. Saturday jackpot at 21:00. Live on the site, RNG seed is published before the draw."
          />
          <StepCard
            number="04"
            title="Get paid"
            description="Cash prizes hit your bank in 24h. Product prizes ship within 3 working days, anywhere in Nigeria."
          />
        </div>
      </Container>

      {/* Why our draws can't be rigged */}
      {/* Why our draws can't be rigged — full-width section */}
      <section className="bg-paper py-16 sm:py-20 my-12 border-y border-ink-100">
        <Container size="xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-lg overflow-hidden border border-ink-100 bg-white">
            <div className="p-8 sm:p-12">
              <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-3">
                Verifiable RNG
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink-950 mb-6">
                Why our draws can&apos;t be rigged
              </h2>
              <ol className="space-y-5 text-base text-ink-700 leading-relaxed">
                <li>
                  <span className="font-semibold text-ink-950">Before</span> the draw: we generate a
                  random seed and publish its SHA-256 hash on this site at midnight.
                </li>
                <li>
                  <span className="font-semibold text-ink-950">During</span> the draw: ticket numbers
                  are sorted, the seed is fed to a deterministic RNG, the winning index is picked.
                </li>
                <li>
                  <span className="font-semibold text-ink-950">After</span> the draw: the original
                  seed is revealed. Anyone can hash it themselves and confirm it matches what we
                  published.
                </li>
              </ol>
              <Link
                href="/audit"
                className="inline-flex items-center gap-1 text-sm text-navy-800 hover:text-navy-700 font-medium mt-8"
              >
                Read the full audit method →
              </Link>
            </div>

            <div className="bg-navy-900 p-8 sm:p-12 flex items-center">
              <pre className="font-mono text-xs sm:text-sm leading-relaxed text-white/90 overflow-x-auto w-full">
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
                <span className="text-success">4a1f...verified ✓</span>
              </pre>
            </div>
          </div>
        </Container>
      </section>

      {/* What happens if you win */}
      <Container size="lg" className="pb-12">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-950 mb-6">
          What happens if you win
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card variant="default" className="p-6">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-2">
              Product prize
            </p>
            <h3 className="font-display text-xl font-semibold text-ink-950 mb-3">
              We ship it to you
            </h3>
            <ul className="text-sm text-ink-700 space-y-2 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>No verification needed beyond confirming your collection point</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>Dispatched within 5 business days of confirmation</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>Tracking reference sent by SMS</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>Brand new, sealed, manufacturer warranty</span>
              </li>
            </ul>
          </Card>

          <Card variant="default" className="p-6">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-2">
              Cash option
            </p>
            <h3 className="font-display text-xl font-semibold text-ink-950 mb-3">
              We pay your bank account
            </h3>
            <ul className="text-sm text-ink-700 space-y-2 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>Tier 1 KYC required (ID + selfie + bank account)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>10% withholding tax deducted at source on prizes over ₦10,000</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>Bank transfer initiated within 48–72 hours of KYC clearance</span>
              </li>
              <li className="flex gap-2">
                <span className="text-success font-bold">✓</span>
                <span>WHT certificate generated automatically</span>
              </li>
            </ul>
          </Card>
        </div>
        <p className="text-xs text-ink-500 mt-4 text-center">
          You have 7 days from the draw to choose between product and cash. If you don&apos;t
          choose, the prize defaults to product fulfilment.
        </p>
      </Container>

      {/* CTA strip */}
      <Container size="lg" className="pb-16">
        <Card variant="dark" className="p-10 sm:p-12 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
            Ready to play?
          </h2>
          {dailyDraw && (
            <p className="text-white/70 mb-6 text-base">
              One ticket is {formatNaira(dailyDraw.ticketPriceNgn)}. Today&apos;s draw closes in{' '}
              <span className="font-mono text-amber-400">6 hours</span>.
            </p>
          )}
          {dailyDraw && (
            <Link href={`/draws/${dailyDraw.drawCode}`}>
              <Button variant="accent" size="lg">
                Buy a ticket — {formatNaira(dailyDraw.ticketPriceNgn)}
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
    <Card variant="default" className="p-6">
      <p className="font-display text-3xl font-bold text-amber-500 mb-4 tabular-nums">
        {number}
      </p>
      <h3 className="font-display text-base font-semibold text-ink-950 mb-2">{title}</h3>
      <p className="text-sm text-ink-500 leading-relaxed">{description}</p>
    </Card>
  );
}