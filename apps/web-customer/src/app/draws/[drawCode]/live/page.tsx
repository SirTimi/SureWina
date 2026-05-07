import { Metadata } from 'next';
import { LiveDrawView } from '@/components/live-draw-view';

interface LiveDrawPageProps {
  params: Promise<{ drawCode: string }>;
}

export const metadata: Metadata = {
  title: 'Live draw · Surewina',
  description: 'Watch a Surewina draw run with public RNG seed verification.',
};

export default async function LiveDrawPage({ params }: LiveDrawPageProps) {
  const { drawCode } = await params;

  return <LiveDrawView drawCode={drawCode} />;
}