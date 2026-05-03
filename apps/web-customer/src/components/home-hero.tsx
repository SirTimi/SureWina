import Link from 'next/link';
import { ArrowRight, Shield } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';

interface HomeHeroProps {
  primaryDrawCode?: string;
  primaryTicketPrice?: number;
}

export function HomeHero({ primaryDrawCode, primaryTicketPrice }: HomeHeroProps) {
  return (
    <section className="bg-navy-900 text-white">
      <Container size="lg" className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 mb-6">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-white/80">Licensed under Nigerian lottery law · NLRC</span>
          </div>

          <h1 className="font-display font-bold text-5xl sm:text-6xl leading-[1.04] tracking-tight">
            Win real prizes.<br />
            <span className="text-amber-500">Trust the draw.</span>
          </h1>

          <p className="text-base sm:text-lg text-white/70 mt-5 max-w-xl leading-relaxed">
            Daily product draws and a {formatNaira(4000000)} jackpot every Saturday.
            Audited, regulated, and transparent — every draw publishes its RNG seed hash.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            {primaryDrawCode && primaryTicketPrice !== undefined && (
              <Link href={`/draws/${primaryDrawCode}`}>
                <Button variant="accent" size="lg">
                  Buy a ticket — {formatNaira(primaryTicketPrice)}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
            <Link href="/how-it-works">
              <Button variant="secondary" size="lg" className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                How it works
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}