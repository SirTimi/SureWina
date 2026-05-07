import { ClaimStatusView } from '@/components/claim-status-view';

interface ClaimStatusPageProps {
  params: Promise<{ claimId: string }>;
}

export default async function ClaimStatusPage({ params }: ClaimStatusPageProps) {
  const { claimId } = await params;
  return <ClaimStatusView claimId={claimId} />;
}