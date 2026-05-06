import Link from 'next/link';
import { ArrowRight, BadgeCheck, Lock, PlayCircle, ShieldCheck, Users } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';

interface HomeHeroProps {
  primaryDrawCode?: string;
  primaryTicketPrice?: number;
}

export function HomeHero({ primaryDrawCode, primaryTicketPrice }: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.22),transparent_32%),linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]">
      <Container size="lg" className="relative grid min-h-[520px] grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:py-14">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Licensed under Nigerian lottery law · NLRC
          </div>

          <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
            Win real prizes.
            <br />
            <span className="text-blue-700">Trust</span> the draw.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700">
            Daily product draws and a {formatNaira(4000000)} jackpot every Saturday.
            Audited, regulated, and transparent, every draw publishes its RNG seed hash.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {primaryDrawCode && primaryTicketPrice !== undefined && (
              <Link href={`/draws/${primaryDrawCode}`}>
                <Button
                  variant="accent"
                  size="lg"
                  className="rounded-xl bg-amber-400 font-bold text-navy-950 hover:bg-amber-300"
                >
                  Buy a ticket — {formatNaira(primaryTicketPrice)}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}

            <Link href="/how-it-works">
              <Button
                variant="secondary"
                size="lg"
                className="rounded-xl border-slate-200 bg-white font-bold text-blue-800 shadow-sm"
              >
                <PlayCircle className="h-5 w-5" />
                How it works
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <BadgeCheck className="h-7 w-7 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-navy-950">Licensed & Regulated</p>
                <p className="text-xs text-slate-500">NLRC Certified</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Lock className="h-7 w-7 text-blue-600" />
              <div>
                <p className="text-sm font-bold text-navy-950">100% Transparent</p>
                <p className="text-xs text-slate-500">RNG Seed Hash</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users className="h-7 w-7 text-violet-600" />
              <div>
                <p className="text-sm font-bold text-navy-950">Trusted by Thousands</p>
                <p className="text-xs text-slate-500">Across Nigeria</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-[500px] items-center justify-center lg:flex">
          <div className="absolute inset-8 rounded-full bg-amber-200/30 blur-3xl" />
          <img
            src="/images/hero-keke.webp"
            alt="Surewina grand prize"
            className="relative z-10 max-h-[600px] w-full object-contain drop-shadow-[0_30px_60px_rgba(15,23,42,0.25)]"
          />
        </div>
      </Container>
    </section>
  );
}