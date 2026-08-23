'use client';
export const dynamic = 'force-dynamic';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Printer } from 'lucide-react';
import type { TicketReceipt as ReceiptData } from '@surewina/api-client';
import { TicketReceipt } from '@/components/ticket-receipt';
import { api } from '@/lib/api';

export default function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tickets
      .receipt(token)
      .then(setReceipt)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : 'This receipt link is not valid or has expired.',
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <h1 className="mt-3 text-xl font-black text-[#0B1220]">Receipt unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <p className="mt-4 text-sm text-slate-500">
          You can still check a ticket by its reference on the{' '}
          <Link href="/lookup" className="font-bold text-navy-700 underline">
            ticket lookup page
          </Link>
          .
        </p>
      </div>
    );
  }

  const multiple = receipt.tickets.length > 1;

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: 75mm auto; margin: 0; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .receipt-page { page-break-after: always; }
          .receipt-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="no-print mb-6 text-center">
          <h1 className="text-2xl font-black text-[#0B1220]">
            {multiple ? `Your ${receipt.tickets.length} tickets` : 'Your ticket'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bought on {receipt.buyerPhone}. Print or save this page.
          </p>

          <button
            type="button"
            onClick={() => window.print()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0B1220] px-6 py-3 font-black text-white"
          >
            <Printer className="h-4 w-4" />
            Print {multiple ? `${receipt.tickets.length} tickets` : 'ticket'}
          </button>
        </div>

        <div className="flex flex-col items-center gap-6">
          {receipt.tickets.map((ref) => (
            <div
              key={ref}
              className="receipt-page rounded-lg border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
            >
              <TicketReceipt receipt={receipt} ticketRef={ref} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}