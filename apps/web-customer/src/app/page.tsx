import Link from 'next/link';
import { Container } from '@surewina/ui';
import { api } from '@/lib/api';
import { HomeHero } from '@/components/home-hero';
import { DrawCard } from '@/components/draw-card';
import { TrustPanel } from '@/components/trust-panel';
import { JackpotExplainer } from '@/components/jackpot-explainer';
import { RecentWinners } from '@/components/recent-winners';

export default async function HomePage() {
  const [{ draws }, recentStats] = await Promise.all([
    api.draws.listActive(),
    api.stats.getRecentStats(),
  ]);

  const drawsWithStats = await Promise.all(
    draws.map(async (draw) => {
      try {
        const detail = await api.draws.getById(draw.drawCode);
        return { draw, ticketsSold: detail.ticketsSold };
      } catch {
        return { draw, ticketsSold: undefined };
      }
    }),
  );

  const dailyDraw = drawsWithStats.find((d) => d.draw.drawType === 'DAILY_STANDARD');

  return (
    <>
      <HomeHero
        primaryDrawCode={dailyDraw?.draw.drawCode}
        primaryTicketPrice={dailyDraw?.draw.ticketPriceNgn}
      />

      <Container size="lg" className="py-12">
        <div className="flex items-end justify-between mb-6 mt-10">
          <h2 className="text-[30px] font-display font-semibold text-ink-950">Active Draws</h2>
          <Link
            href="/draws"
            className="text-sm text-navy-800 hover:text-navy-700 font-medium"
          >
            See all draws →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {drawsWithStats.map(({ draw, ticketsSold }) => (
            <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
          ))}
        </div>

        <div className="mt-8">
          <TrustPanel />
        </div>
      </Container>

      <JackpotExplainer />

      <RecentWinners winners={recentStats.recentWinners} />
    </>
  );
}