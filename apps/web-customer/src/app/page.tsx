import Link from 'next/link';
import { Container } from '@surewina/ui';
import { api } from '@/lib/api';
import { HomeHero } from '@/components/home-hero';
import { DrawCard } from '@/components/draw-card';
import { TrustPanel } from '@/components/trust-panel';
import { JackpotExplainer } from '@/components/jackpot-explainer';
import { RecentWinners } from '@/components/recent-winners';
import { MarqueeBar } from '@/components/marquee-bar';


// Draws change daily — never serve a build-time snapshot.
export const revalidate = 60;

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

  const homepageDraws = drawsWithStats.slice(0, 2);

  return (
    <>
      <HomeHero
        primaryDrawCode={dailyDraw?.draw.drawCode}
        primaryTicketPrice={dailyDraw?.draw.ticketPriceNgn}
      />

      <MarqueeBar />

      <Container size="lg" className="max-w-[1400px] py-12">
        <div className="mb-6 mt-10 flex items-end justify-between">
          <h2 className="font-display text-[30px] font-semibold text-ink-950">
            Active Draws
          </h2>

          <Link
            href="/draws"
            className="text-sm font-medium text-navy-800 hover:text-navy-700"
          >
            See all draws →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {homepageDraws.map(({ draw, ticketsSold }) => (
              <DrawCard key={draw.drawCode} draw={draw} ticketsSold={ticketsSold} />
            ))}
          </div>

          <TrustPanel layout="broken" />
        </div>
      </Container>

      <JackpotExplainer />

      <RecentWinners winners={recentStats.recentWinners} />
    </>
  );
}