import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';

export function JackpotExplainer() {
  return (
    <Container size="lg" className="my-16">
      <Card variant="dark" className="p-8 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-3">
              The 10-for-1 rule
            </p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl leading-tight mb-4">
              Every 10 daily tickets earns you<br />1 free Saturday jackpot entry.
            </h2>
            <p className="text-white/70 leading-relaxed mb-6">
              Buy daily tickets, win daily prizes, and quietly stack entries into the ₦4,000,000
              Saturday draw. No subscription, no hidden math, the count is on your dashboard, always.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/how-it-works">
                <Button variant="accent" size="md">
                  See full rules
                </Button>
              </Link>
              <Link href="/audit">
                <Button variant="secondary" size="md" className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                  Read the licence
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            {/* 10 ticket grid */}
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="w-12 h-8 bg-white/5 border border-white/10 rounded flex items-center justify-center"
                >
                  <span className="text-[9px] font-mono text-white/40">₦500</span>
                </div>
              ))}
            </div>
            <ArrowRight className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="bg-amber-500 rounded-lg px-4 py-3 text-center min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-white">1 entry</p>
              <p className="text-base font-bold text-white whitespace-nowrap">Sat ₦4M</p>
            </div>
          </div>
        </div>
      </Card>
    </Container>
  );
}