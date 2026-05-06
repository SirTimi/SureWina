import { LiveDrawView } from '@/components/live-draw-view';

interface LiveDrawPageProps {
  params: Promise<{ drawCode: string }>;
}

export default async function LiveDrawPage({ params }: LiveDrawPageProps) {
  const { drawCode } = await params;
  return <LiveDrawView drawCode={drawCode} />;
}