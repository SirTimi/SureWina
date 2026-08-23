export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Gift, Trophy } from 'lucide-react';
import { Button, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';



export default async function BuyTicketChoicePage() {
  const { draws } = await api.draws.listActive();

  const dailyDraw = draws.find((draw) => draw.drawType === 'DAILY_STANDARD');
  const jackpotDraw = draws.find((draw) => draw.drawType === 'SATURDAY_JACKPOT');

  return (
    <main className="bg-[#F8FAF4]">
      <Container size="lg" className="max-w-[1120px] pb-16 pt-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-navy-700">
            Buy ticket
          </p>

          <h1 className="mt-3 font-display text-4xl font-black leading-tight tracking-[-0.04em] text-navy-950 sm:text-5xl">
            Choose how you want to enter.
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Buy today’s regular draw ticket or enter the coming Saturday jackpot
            directly.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {dailyDraw ? (
            <TicketChoiceCard
              title={dailyDraw.prizeDescription}
              eyebrow="Today’s draw"
              description="Buy a regular ticket for today’s named Surewina draw."
              priceLabel={formatNaira(dailyDraw.ticketPriceNgn)}
              scheduleLabel={`${formatDrawDate(dailyDraw.scheduledAt)} · ${formatDrawTime(
                dailyDraw.scheduledAt,
              )}`}
              href={`/draws/${dailyDraw.drawCode}`}
              cta="Buy regular ticket"
              icon={<Gift className="h-7 w-7" />}
            />
          ) : (
            <UnavailableCard
              title="Today’s draw unavailable"
              description="Regular ticket sales are currently closed. Please check back when the next draw opens."
            />
          )}

          {jackpotDraw ? (
            <TicketChoiceCard
              title="Sure Jackpot"
              eyebrow="Saturday jackpot"
              description="Buy a direct jackpot ticket for the coming Saturday draw."
              priceLabel={formatNaira(jackpotDraw.ticketPriceNgn)}
              scheduleLabel={`${formatDrawDate(jackpotDraw.scheduledAt)} · ${formatDrawTime(
                jackpotDraw.scheduledAt,
              )}`}
              href={`/draws/${jackpotDraw.drawCode}`}
              cta="Buy jackpot ticket"
              icon={<Trophy className="h-7 w-7" />}
              featured
            />
          ) : (
            <UnavailableCard
              title="Jackpot unavailable"
              description="Jackpot ticket sales are currently closed. Please check back when the next jackpot draw opens."
            />
          )}
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-slate-500">
          Regular ₦500 tickets enter the day’s draw. Every 10 regular tickets also
          earns 1 free entry into the coming Saturday jackpot draw. Direct jackpot
          tickets go straight into the Saturday jackpot bucket.
        </p>
      </Container>
    </main>
  );
}

function TicketChoiceCard({
  title,
  eyebrow,
  description,
  priceLabel,
  scheduleLabel,
  href,
  cta,
  icon,
  featured = false,
}: {
  title: string;
  eyebrow: string;
  description: string;
  priceLabel: string;
  scheduleLabel: string;
  href: string;
  cta: string;
  icon: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <Card
      variant="default"
      className={
        featured
          ? 'rounded-3xl border-amber-200 bg-amber-50 p-6 shadow-sm'
          : 'rounded-3xl border-navy-100 bg-white p-6 shadow-sm'
      }
    >
      <div
        className={
          featured
            ? 'mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-navy-950'
            : 'mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-white'
        }
      >
        {icon}
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {eyebrow}
      </p>

      <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>

      <div className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-white/70 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-500">Ticket price</span>
          <span className="font-display text-lg font-black text-navy-950">
            {priceLabel}
          </span>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 text-navy-700" />
            Draw time
          </span>
          <span className="text-right text-xs font-bold text-navy-950">
            {scheduleLabel}
          </span>
        </div>
      </div>

      <Link href={href} className="mt-5 block">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
        >
          {cta}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </Link>
    </Card>
  );
}

function UnavailableCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card
      variant="default"
      className="rounded-3xl border-slate-200 bg-white p-6 opacity-80 shadow-sm"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Gift className="h-7 w-7" />
      </div>

      <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </Card>
  );
}