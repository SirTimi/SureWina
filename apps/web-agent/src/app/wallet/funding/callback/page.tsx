import { redirect } from 'next/navigation';

interface AgentWalletFundingCallbackProps {
  searchParams: Promise<{
    paymentReference?: string;
    tx_ref?: string;
    reference?: string;
    trxref?: string;
    transaction_id?: string;
    status?: string;
  }>;
}

export default async function AgentWalletFundingCallbackPage({
  searchParams,
}: AgentWalletFundingCallbackProps) {
  const params = await searchParams;

  const reference =
    params.paymentReference ??
    params.tx_ref ??
    params.reference ??
    params.trxref;

  if (!reference) {
    redirect('/wallet?fundingError=missing-reference');
  }

  const query = new URLSearchParams({
    fundingReference: reference,
  });

  if (params.transaction_id) {
    query.set('transactionId', params.transaction_id);
  }

  /*
   * Provider-returned status is not trusted. The authenticated agent wallet
   * page asks the API to verify the payment before any wallet credit is shown.
   */
  redirect(`/wallet?${query.toString()}`);
}
