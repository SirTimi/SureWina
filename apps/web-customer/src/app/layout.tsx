import type { Metadata } from 'next';
import { AppHeaderSwitcher } from '@/components/app-header-switcher';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'Surewina - Win real prizes. Trust the draw.',
  description:
    "Nigeria's regulated digital raffle platform. Daily product draws and a guaranteed ₦4,000,000 Saturday jackpot. Audited, regulated, transparent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-paper text-ink-950 antialiased">
        <AppHeaderSwitcher />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}