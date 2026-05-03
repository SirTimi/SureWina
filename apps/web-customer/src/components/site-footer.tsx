import Link from 'next/link';
import { Container, Logo } from '@surewina/ui';

export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-white/70 mt-16">
      <Container size="lg" className="py-12">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 mb-10">
          <div className="sm:col-span-1">
            <Logo size="md" inverted />
            <p className="text-xs mt-3 text-white/50">
              Nigeria&apos;s regulated digital raffle platform.
            </p>
          </div>

          <div>
            <h3 className="font-display font-semibold text-white text-sm mb-3">Play</h3>
            <ul className="space-y-2 text-xs">
              <li><Link href="/" className="hover:text-white transition-colors">Active draws</Link></li>
              <li><Link href="/how-it-works" className="hover:text-white transition-colors">How it works</Link></li>
              <li><Link href="/lookup" className="hover:text-white transition-colors">Check a ticket</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display font-semibold text-white text-sm mb-3">Trust</h3>
            <ul className="space-y-2 text-xs">
              <li><Link href="/results" className="hover:text-white transition-colors">Past results</Link></li>
              <li><Link href="/audit" className="hover:text-white transition-colors">Audit method</Link></li>
              <li><Link href="/responsible-play" className="hover:text-white transition-colors">Responsible play</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display font-semibold text-white text-sm mb-3">Legal</h3>
            <ul className="space-y-2 text-xs">
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy policy</Link></li>
              <li><Link href="/disputes" className="hover:text-white transition-colors">Dispute resolution</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-xs space-y-2">
          <p>
            Operated under licence from the National Lottery Regulatory Commission of Nigeria.{' '}
            <span className="font-mono text-white/50">Licence #NL/2025/0241</span>
          </p>
          <p className="text-white/50">
            Surewina Limited · Lagos · Saturday jackpot draws are independently audited. Every draw publishes its RNG seed hash.
          </p>
          <p className="text-white/40">
            18+ only. Play responsibly. If gambling is becoming a problem, call{' '}
            <span className="font-mono">0800 GAMBLE</span>.
          </p>
        </div>
      </Container>
    </footer>
  );
}