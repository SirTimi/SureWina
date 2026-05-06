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
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(251,191,36,0.42)_0%,rgba(251,191,36,0.22)_22%,transparent_48%),radial-gradient(circle_at_8%_12%,rgba(37,99,235,0.09)_0%,transparent_34%),linear-gradient(180deg,#ffffff_0%,#fff8e7_62%,#fbfaf5_100%)]">
      <style>
        {`
          @keyframes surewina-float {
            0%, 100% {
              transform: translateY(0) scale(1.08);
            }
            50% {
              transform: translateY(-14px) scale(1.08);
            }
          }
        `}
      </style>

      <Container
        size="lg"
        className="relative grid min-h-[620px] grid-cols-1 items-center gap-8 pb-20 pt-12 lg:grid-cols-[0.82fr_1.18fr] lg:pb-24 lg:pt-16"
      >
        <div className="relative z-20 max-w-[620px] lg:-ml-8 xl:-ml-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-4 py-2 text-sm font-semibold text-blue-800 shadow-sm backdrop-blur">
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
                  className="rounded-xl bg-amber-400 font-bold text-navy-950 shadow-[0_16px_34px_rgba(245,158,11,0.28)] hover:bg-amber-300"
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
                className="rounded-xl border-slate-200 bg-white/90 font-bold text-blue-800 shadow-sm backdrop-blur"
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

        <div className="relative z-10 hidden min-h-[560px] items-center justify-center lg:flex">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="absolute bottom-16 left-1/2 h-16 w-[420px] -translate-x-1/2 rounded-full bg-amber-900/10 blur-2xl" />

          <img
            src="/images/hero-keke.webp"
            alt="Surewina grand prize"
            className="relative z-10 max-h-[720px] w-[200%] max-w-none object-contain drop-shadow-[0_38px_70px_rgba(15,23,42,0.26)]"
            style={{ animation: 'surewina-float 4.5s ease-in-out infinite' }}
          />
        </div>
      </Container>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#fbfaf5]" />
    </section>
  );
}