'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@surewina/ui';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', exact: true },
  { href: '/dashboard/tickets', label: 'My tickets' },
  { href: '/dashboard/claims', label: 'Claims' },
  { href: '/dashboard/account', label: 'Account' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 -mb-px overflow-x-auto" aria-label="Dashboard">
      {navItems.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'whitespace-nowrap px-3 py-3.5 text-sm font-medium border-b-2 transition-colors',
              isActive
                ? 'text-navy-800 border-navy-800'
                : 'text-ink-500 border-transparent hover:text-ink-950 hover:border-ink-200',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}