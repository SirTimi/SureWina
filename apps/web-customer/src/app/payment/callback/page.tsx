import { redirect } from 'next/navigation';

// Hosted collection providers return different reference parameter names:
// Monnify -> paymentReference
// Flutterwave -> tx_ref
// Legacy Paystack -> reference / trxref
//
// We use only the merchant reference to open SureWina's processing page.
// Provider status parameters are intentionally ignored; the API verifies the
// payment server-side before tickets are created.
export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentReference?: string;
    tx_ref?: string;
    reference?: string;
    trxref?: string;
    transaction_id?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  const reference =
    params.paymentReference ??
    params.tx_ref ??
    params.reference ??
    params.trxref;

  if (!reference) {
    redirect('/');
  }

  const query =
    new URLSearchParams({
      session:
        reference,
    });

  if (
    params.transaction_id
  ) {
    query.set(
      'transactionId',
      params.transaction_id,
    );
  }

  redirect(
    `/purchase/processing?${query.toString()}`,
  );
}
