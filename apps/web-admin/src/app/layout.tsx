import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Surewina Admin',
  description: 'Operate draws, agents, claims, and compliance for Surewina.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F5F7FB] text-[#0B1220] antialiased">
        {children}
      </body>
    </html>
  );
}
