import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Surewina Agent Portal',
  description: 'Sell Surewina tickets, track commission, and manage remittance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAF4] text-navy-950 antialiased">
        {children}
      </body>
    </html>
  );
}