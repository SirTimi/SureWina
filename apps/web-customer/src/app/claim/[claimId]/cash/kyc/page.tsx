import { ClaimKycView } from '@/components/claim-kyc-view';

interface KycPageProps {
  params: Promise<{ claimId: string }>;
  searchParams: Promise<{ step?: string }>;
}

export default async function ClaimKycPage({ params, searchParams }: KycPageProps) {
  const { claimId } = await params;
  const { step } = await searchParams;
  const initialStep =
    step === 'bvn' || step === 'bank' || step === 'docs' ? step : 'docs';
  return <ClaimKycView claimId={claimId} initialStep={initialStep} />;
}