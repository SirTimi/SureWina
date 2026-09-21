import { redirect } from 'next/navigation';

interface WalletFundingCallbackProps {
  searchParams: Promise<{
    paymentReference?: string;
    tx_ref?: string;
    reference?: string;
    trxref?: string;
    transaction_id?: string;
    status?: string;
  }>;
}

export default async function WalletFundingCallbackPage({
  searchParams,
}: WalletFundingCallbackProps) {
  const params = await searchParams;

  const reference =
    params.paymentReference ??
    params.tx_ref ??
    params.reference ??
    params.trxref;

  if (!reference) {
    redirect('/dashboard/wallet?fundingError=missing-reference');
  }

  const query = new URLSearchParams({
    fundingReference: reference,
  });

  if (params.transaction_id) {
    query.set('transactionId', params.transaction_id);
  }

  /*
   * Provider-returned status is intentionally not trusted here.
   * The wallet page asks the API to verify the payment server-side
   * before any balance is credited.
   */
  redirect(`/dashboard/wallet?${query.toString()}`);
}
