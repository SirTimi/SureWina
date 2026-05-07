import { ClaimChooserView } from '@/components/claim-chooser-view';

interface ClaimChooserPageProps {
  params: Promise<{ claimId: string }>;
}

export default async function ClaimChooserPage({ params }: ClaimChooserPageProps) {
  const { claimId } = await params;
  return <ClaimChooserView claimId={claimId} />;
}