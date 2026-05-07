import { ClaimCashView } from '@/components/claim-cash-view';

interface ClaimCashPageProps {
  params: Promise<{ claimId: string }>;
}

export default async function ClaimCashPage({ params }: ClaimCashPageProps) {
  const { claimId } = await params;
  return <ClaimCashView claimId={claimId} />;
}