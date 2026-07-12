import { redirect } from 'next/navigation';

// Paystack redirects buyers here after checkout with ?reference=SW-PAY-...
// (older Paystack flows use ?trxref=). Bridge to the processing view.
export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref;
  if (!reference) redirect('/');
  redirect(`/purchase/processing?session=${encodeURIComponent(reference)}`);
}