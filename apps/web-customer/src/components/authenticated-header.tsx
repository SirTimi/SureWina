'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Ticket,
  Trophy,
  User,
  WalletCards,
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

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('surewina_access_token');
      localStorage.removeItem('surewina_refresh_token');
      localStorage.removeItem('surewina_user_id');
    }

    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#4E8F01]/10 bg-white/90 backdrop-blur-xl">
      <Container
        size="lg"
        className="flex h-20 max-w-[1400px] items-center justify-between gap-6"
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

        <div className="flex items-center gap-2">
          <Link
            href="/draws"
            className="hidden items-center gap-2 rounded-sm bg-[#A8E368] px-4 py-2.5 text-sm font-bold text-navy-950 transition hover:bg-[#B7EF79] sm:inline-flex"
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
      </Container>

      <div className="border-t border-slate-100 bg-white lg:hidden">
        <Container size="lg" className="max-w-[1400px] overflow-x-auto py-2">
          <nav className="flex min-w-max items-center gap-2">
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
                      ? 'inline-flex items-center gap-2 rounded-sm bg-[#4E8F01] px-3 py-2 text-xs font-bold text-white'
                      : 'inline-flex items-center gap-2 rounded-sm bg-[#F8FAF4] px-3 py-2 text-xs font-bold text-slate-600'
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Container>
      </div>
    </header>
  );
}