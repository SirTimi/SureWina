import { WinnerNotificationView } from '@/components/winner-notification-view';

interface WinnerPageProps {
  params: Promise<{ claimId: string }>;
}

export default async function WinnerPage({ params }: WinnerPageProps) {
  const { claimId } = await params;
  return <WinnerNotificationView claimId={claimId} />;
}