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
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(251,191,36,0.42)_0%,rgba(251,191,36,0.22)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#fff7e6_48%,#ffe9a8_100%)]">
      <style>
        {`
          @keyframes surewina-float {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }
        `}
      </style>

      <Container size="lg" className="relative min-h-[620px] pb-20 pt-14 lg:pb-24 lg:pt-16">
        <div className="pointer-events-none absolute inset-y-0 right-[-6%] z-0 hidden w-[58%] items-center justify-end lg:flex">
          <div className="absolute right-[8%] top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="absolute bottom-24 right-[16%] h-16 w-[420px] rounded-full bg-amber-900/10 blur-2xl" />

          <img
            src="/images/hero-keke.webp"
            alt="Surewina grand prize"
            className="relative z-10 h-[500px] w-full object-contain object-right drop-shadow-[0_34px_70px_rgba(15,23,42,0.24)]"
            style={{ animation: 'surewina-float 4.8s ease-in-out infinite' }}
          />
        </div>

        <div className="relative z-20 max-w-[650px]">
          <div className="mb-6 inline-flex items-center gap-2  border border-blue-100 bg-white/85 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm backdrop-blur">
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
                  className="rounded-sm bg-amber-400 font-bold text-navy-950 shadow-[0_16px_34px_rgba(245,158,11,0.28)] hover:bg-amber-300"
                >
                  Buy a ticket {formatNaira(primaryTicketPrice)}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}

            <Link href="/how-it-works">
              <Button
                variant="secondary"
                size="lg"
                className="rounded-sm border-slate-200 bg-white/90 font-bold text-blue-800 shadow-sm backdrop-blur"
              >
                <PlayCircle className="h-5 w-5" />
                How it works
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 border-t border-slate-200/80 pt-6 sm:grid-cols-3">
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

        <div className="relative z-10 mt-10 flex justify-center lg:hidden">
          <img
            src="/images/hero-keke.webp"
            alt="Surewina grand prize"
            className="max-h-[340px] w-full object-contain drop-shadow-[0_28px_60px_rgba(15,23,42,0.22)]"
          />
        </div>
      </Container>
    </section>
  );
}