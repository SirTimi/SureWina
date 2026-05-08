'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Ticket,
  Trophy,
  User,
  WalletCards,
  X,
} from 'lucide-react';
import { Container, Logo } from '@surewina/ui';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Tickets',
    href: '/dashboard/tickets',
    icon: Ticket,
  },
  {
    label: 'Claims',
    href: '/dashboard/claims',
    icon: Trophy,
  },
  {
    label: 'Responsible play',
    href: '/dashboard/responsible-play',
    icon: ShieldCheck,
  },
];

export function AuthenticatedHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('surewina_access_token');
      localStorage.removeItem('surewina_refresh_token');
      localStorage.removeItem('surewina_user_id');
    }

    setIsOpen(false);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#4E8F01]/10 bg-white/90 backdrop-blur-xl">
      <Container
        size="lg"
        className="relative flex h-20 max-w-[1400px] items-center justify-between gap-6"
      >
        <Link href="/dashboard" aria-label="Surewina dashboard" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 rounded-sm border border-slate-200 bg-[#F8FAF4] p-1 lg:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? 'inline-flex items-center gap-2 rounded-sm bg-[#4E8F01] px-4 py-2.5 text-sm font-bold text-white shadow-sm'
                    : 'inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#A8E368]/15 hover:text-[#4E8F01]'
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Link
            href="/draws"
            className="inline-flex items-center gap-2 rounded-sm bg-[#A8E368] px-4 py-2.5 text-sm font-bold text-navy-950 transition hover:bg-[#B7EF79]"
          >
            <WalletCards className="h-4 w-4" />
            Buy tickets
          </Link>

          <Link
            href="/dashboard/account"
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-[#4E8F01] transition hover:bg-[#A8E368]/15"
            aria-label="Profile"
          >
            <User className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={logout}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-slate-500 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <Link
            href="/draws"
            className="rounded-sm bg-[#A8E368] px-4 py-2.5 text-sm font-bold text-navy-950"
          >
            Buy
          </Link>

          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-navy-950"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {isOpen && (
          <div className="absolute left-4 right-4 top-[76px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)] sm:hidden">
            <nav className="p-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={
                      isActive
                        ? 'flex items-center gap-3 rounded-xl bg-[#4E8F01] px-4 py-3 text-sm font-bold text-white'
                        : 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-[#F8FAF4] hover:text-[#4E8F01]'
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
              <Link
                href="/dashboard/account"
                onClick={closeMenu}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-navy-950"
              >
                <User className="h-4 w-4" />
                Account
              </Link>

              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        )}
      </Container>
    </header>
  );
}