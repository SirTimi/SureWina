import { AgentWalletScreen } from '@/components/agent-wallet-view';

interface AgentWalletPageProps {
  searchParams: Promise<{
    fundingReference?: string;
    transactionId?: string;
    fundingError?: string;
  }>;
}

export default async function AgentWalletPage({
  searchParams,
}: AgentWalletPageProps) {
  const params = await searchParams;

  return (
    <AgentWalletScreen
      fundingReference={params.fundingReference ?? null}
      providerTransactionId={params.transactionId ?? null}
      callbackError={params.fundingError ?? null}
    />
  );
}
