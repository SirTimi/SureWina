'use client';

import { usePathname } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { AuthenticatedHeader } from '@/components/authenticated-header';

export function AppHeaderSwitcher() {
  const pathname = usePathname();

  const isAuthenticatedArea =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (isAuthenticatedArea) {
    return <AuthenticatedHeader />;
  }

  return <SiteHeader />;
}