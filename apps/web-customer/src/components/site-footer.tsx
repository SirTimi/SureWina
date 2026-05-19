import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Container, Logo } from '@surewina/ui';

const footerGroups = [
  {
    title: 'Play',
    links: [
      { label: 'Active draws', href: '/draws' },
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Check a ticket', href: '/lookup' },
      { label: 'Past results', href: '/results' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Audit method', href: '/audit' },
      { label: 'RNG seed hashes', href: '/audit#seed-hashes' },
      { label: 'Public archive', href: '/results' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Disputes', href: '/disputes' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Support', href: 'support'},
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-navy-900 text-white">
      <Container size="lg" className="max-w-[1400px] py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <Logo/>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/75">
              Surewina is a regulated digital raffle platform for transparent product
              draws and audited jackpot entries in Nigeria.
            </p>

            <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-black text-white">
                      Licensed operation
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-white/65">
                      Operated under licence from the National Lottery Regulatory
                      Commission.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-sm font-black text-white">Public verification</p>
                <p className="mt-1 text-xs leading-relaxed text-white/65">
                  Every draw publishes public references, timestamps, and RNG seed hash
                  records.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-black uppercase tracking-[0.14em] text-amber-400">
                  {group.title}
                </h3>

                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm font-medium text-white/70 transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="my-10 h-px bg-white/15" />

        <div className="grid gap-6 text-xs leading-relaxed text-white/60 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-4xl space-y-2">
            <p>
              Surewina Limited · Lagos, Nigeria · Licence{' '}
              <span className="font-mono font-semibold text-white">
                #NL/2025/0241
              </span>
            </p>

            <p>
              18+ only. Play responsibly. Raffles involve risk. If gambling is becoming a
              problem, call{' '}
              <span className="font-mono font-semibold text-white">
                0800 GAMBLE
              </span>
              .
            </p>

            <p>
              Winner privacy is protected. Public results show draw references, prizes,
              timestamps, and verification records — not private personal details.
            </p>
          </div>

          <Link
            href="/audit"
            className="inline-flex items-center gap-2 rounded-sm border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            Verify draw integrity
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </footer>
  );
}