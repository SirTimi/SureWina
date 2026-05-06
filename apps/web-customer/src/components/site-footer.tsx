import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Container, Logo } from '@surewina/ui';

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-navy-950 text-white/70">
      <Container size="lg" className="py-14">
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.1fr]">
          <div>
            <Logo showWordmark inverted />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              Nigeria&apos;s regulated digital raffle platform.
            </p>

            <div className="mt-5 flex items-center gap-3 text-white/60">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-bold">
                f
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-bold">
                x
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-bold">
                ig
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-bold">
                yt
              </span>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-black text-white">Play</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/" className="transition hover:text-white">
                  Active draws
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="transition hover:text-white">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/lookup" className="transition hover:text-white">
                  Check a ticket
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-black text-white">Trust</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/results" className="transition hover:text-white">
                  Past results
                </Link>
              </li>
              <li>
                <Link href="/audit" className="transition hover:text-white">
                  Audit method
                </Link>
              </li>
              <li>
                <Link href="/responsible-play" className="transition hover:text-white">
                  Responsible play
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-black text-white">Legal</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/terms" className="transition hover:text-white">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition hover:text-white">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/disputes" className="transition hover:text-white">
                  Dispute resolution
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-black text-white">Secure payments</h3>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white px-3 py-2 text-sm font-black text-blue-900">
                VISA
              </span>
              <span className="rounded-lg bg-white px-3 py-2 text-sm font-black text-red-600">
                Mastercard
              </span>
              <span className="rounded-lg bg-white px-3 py-2 text-sm font-black text-red-700">
                Verve
              </span>
            </div>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Your data is 100% secure
            </div>
          </div>
        </div>

        <div className="grid gap-4 pt-7 text-xs leading-relaxed text-white/45 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <p>
              Operated under licence from the National Lottery Regulatory Commission of
              Nigeria.{' '}
              <span className="font-mono text-white/60">Licence #NL/2025/0241</span>
            </p>
            <p>
              Surewina Limited · Lagos · Saturday jackpot draws are independently audited.
              Every draw publishes its RNG seed hash.
            </p>
            <p>
              18+ only. Play responsibly. If gambling is becoming a problem, call{' '}
              <span className="font-mono text-white/60">0800 GAMBLE</span>.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-white/60">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/35">
                Licensed by
              </p>
              <p className="font-black text-white">NLRC</p>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}