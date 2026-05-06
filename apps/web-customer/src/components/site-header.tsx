import Link from 'next/link';
import { Container, Logo } from '@surewina/ui';

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-2 z-50 bg-transparent">
      <Container
        size="lg"
        className="flex h-20 max-w-[1500px] items-center justify-between"
      >
        <Link href="/" aria-label="Surewina home" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-[14px] font-[600] text-navy-950 md:flex">
          <Link href="/how-it-works" className="transition hover:text-[#4E8F01]">
            How it works
          </Link>

          <Link href="/results" className="transition hover:text-[#4E8F01]">
            Past results
          </Link>

          <Link href="/lookup" className="transition hover:text-[#4E8F01]">
            Check ticket
          </Link>

          <Link
            href="/sign-in"
            className="border-l border-navy-950/10 pl-7 transition hover:text-[#4E8F01]"
          >
            Sign in
          </Link>

          <Link
            href="/draws"
            className="rounded-sm bg-[#4E8F01] px-5 py-3 font-bold text-white transition hover:bg-[#3f7601]"
          >
            Buy a ticket
          </Link>
        </nav>

        <Link
          href="/draws"
          className="rounded-sm bg-[#4E8F01] px-4 py-2.5 text-sm font-bold text-white md:hidden"
        >
          Buy
        </Link>
      </Container>
    </header>
  );
}