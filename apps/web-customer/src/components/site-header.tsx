'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Container, Logo } from '@surewina/ui';

const navItems = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Past results', href: '/results' },
  { label: 'Check ticket', href: '/lookup' },
];

export function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="absolute inset-x-0 top-2 z-50 bg-transparent">
      <Container
        size="lg"
        className="relative flex h-20 max-w-[1400px] items-center justify-between"
      >
        <Link href="/" aria-label="Surewina home" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 text-[14px] font-[600] text-navy-950 md:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[#4E8F01]">
              {item.label}
            </Link>
          ))}

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

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/draws"
            className="rounded-sm bg-[#4E8F01] px-4 py-2.5 text-sm font-bold text-white"
          >
            Buy
          </Link>

          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-navy-950/10 bg-white/80 text-navy-950 shadow-sm backdrop-blur"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isOpen && (
          <div className="absolute left-4 right-4 top-[76px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)] md:hidden">
            <nav className="p-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="block rounded-xl px-4 py-3 text-sm font-bold text-navy-950 transition hover:bg-[#F8FAF4] hover:text-[#4E8F01]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
              <Link
                href="/sign-in"
                onClick={closeMenu}
                className="inline-flex items-center justify-center rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-navy-950"
              >
                Sign in
              </Link>

              <Link
                href="/draws"
                onClick={closeMenu}
                className="inline-flex items-center justify-center rounded-sm bg-[#A8E368] px-4 py-3 text-sm font-bold text-navy-950"
              >
                Buy ticket
              </Link>
            </div>
          </div>
        )}
      </Container>
    </header>
  );
}