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
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(22,89,150,0.10)_0%,rgba(22,89,150,0.05)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#F5F8FF_60%,#E8F0FB_100%)]">
      <style>
        {`
          @keyframes surewina-float {
            0%, 100% {
              transform: translateY(-50%);
            }
            50% {
              transform: translateY(calc(-50% - 10px));
            }
          }
        `}
      </style>

      <Container
        size="lg"
        className="relative min-h-[650px] max-w-[1400px] pb-20 pt-28 lg:pb-24 lg:pt-32"
      >
        <div className="pointer-events-none absolute right-[-40px] top-[68%] z-0 hidden w-[940px] lg:block 2xl:right-[-20px] 2xl:w-[980px]">
          <div className="absolute right-[120px] top-1/2 h-[780px] w-[780px] -translate-y-1/2 rounded-full bg-navy-100/60 blur-3xl" />
          <div className="absolute bottom-[18px] right-[170px] h-20 w-[660px] rounded-full bg-amber-100/40 blur-2xl" />

          <img
            src="/images/hero-keke.webp"
            alt="Surewina grand prize"
            className="relative z-10 w-full object-contain object-right drop-shadow-[0_40px_84px_rgba(15,23,42,0.28)]"
            style={{ animation: 'surewina-float 4.8s ease-in-out infinite' }}
          />
        </div>

        <div className="relative z-20 max-w-[680px]">
          <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-white" />
            Licensed under Nigerian lottery law · NLRC
          </div>

          <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
            Win real prizes.
            <br />
            <span className="text-navy-700">Trust</span> the draw.
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
                  className="rounded-sm font-bold shadow-[0_16px_34px_rgba(216,122,24,0.28)]"
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
                className="rounded-sm border-navy-100 bg-white/90 font-bold text-navy-700 shadow-sm backdrop-blur hover:bg-white"
              >
                <PlayCircle className="h-5 w-5" />
                How it works
              </Button>
            </Link>
          </div>

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-4 border-t border-navy-100 pt-6 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <BadgeCheck className="h-7 w-7 text-navy-700" />
              <div>
                <p className="text-sm font-bold text-navy-950">Licensed & Regulated</p>
                <p className="text-xs text-slate-500">NLRC Certified</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Lock className="h-7 w-7 text-navy-700" />
              <div>
                <p className="text-sm font-bold text-navy-950">100% Transparent</p>
                <p className="text-xs text-slate-500">RNG Seed Hash</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Users className="h-7 w-7 text-navy-700" />
              <div>
                <p className="text-sm font-bold text-navy-950">Trusted by Thousands</p>
                <p className="text-xs text-slate-500">Across Nigeria</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
