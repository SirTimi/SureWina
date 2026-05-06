import Link from 'next/link';
import { Container, Logo } from '@surewina/ui';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 backdrop-blur">
      <Container size="lg" className="flex h-20 items-center justify-between">
        <Link href="/" aria-label="Surewina home" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-navy-950 md:flex">
          <Link href="/how-it-works" className="transition hover:text-blue-700">
            How it works
          </Link>
          <Link href="/results" className="transition hover:text-blue-700">
            Past results
          </Link>
          <Link href="/lookup" className="transition hover:text-blue-700">
            Check ticket
          </Link>
          <Link
            href="/sign-in"
            className="border-l border-slate-200 pl-7 transition hover:text-blue-700"
          >
            Sign in
          </Link>
          <Link
            href="/draws"
            className="rounded-sm bg-[#4E8F01] px-5 py-3 font-bold text-white transition hover:bg-amber-300"
          >
            Buy a ticket
          </Link>
        </nav>

        <Link
          href="/draws"
          className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-navy-950 md:hidden"
        >
          Buy
        </Link>
      </Container>
    </header>
  );
}