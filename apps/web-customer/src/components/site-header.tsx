import Link from 'next/link';
import { Container, Logo } from '@surewina/ui';

export function SiteHeader() {
  return (
    <header className="border-b border-ink-100 bg-white">
      <Container size="lg" className="flex items-center justify-between h-16">
        <Link href="/" aria-label="Surewina home">
          <Logo />
        </Link>

        <nav className="flex items-center gap-5 sm:gap-7 text-sm font-medium text-ink-700">
          <Link href="/how-it-works" className="hover:text-navy-800 transition-colors hidden sm:inline">
            How it works
          </Link>
          <Link href="/results" className="hover:text-navy-800 transition-colors hidden sm:inline">
            Past results
          </Link>
          <Link href="/lookup" className="hover:text-navy-800 transition-colors">
            Check ticket
          </Link>
          <Link
            href="/sign-in"
            className="hover:text-navy-800 transition-colors border-l border-ink-100 pl-5 sm:pl-7"
          >
            Sign in
          </Link>
        </nav>
      </Container>
    </header>
  );
}