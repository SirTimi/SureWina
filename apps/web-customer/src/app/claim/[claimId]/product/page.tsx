import { ClaimProductView } from '@/components/claim-product-view';

interface ClaimProductPageProps {
  params: Promise<{ claimId: string }>;
}

export default async function ClaimProductPage({ params }: ClaimProductPageProps) {
  const { claimId } = await params;
  return <ClaimProductView claimId={claimId} />;
}