import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Gift,
  Hash,
  ShieldCheck,
  Ticket,
  Trophy,
} from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatCountdown, formatDrawDate } from '@/lib/draw-helpers';
import { HowDrawWorks } from '@/components/how-draw-works';
import { BuyTicketPanel } from '@/components/buy-ticket-panel';
import {
  getCustomerDrawName,
  getCustomerDrawSubtitle,
} from '@/lib/customer-draw-display';

interface DrawDetailPageProps {
  params: Promise<{ drawCode: string }>;
}

export default async function DrawDetailPage({ params }: DrawDetailPageProps) {
  const { drawCode } = await params;

  let drawData;

  try {
    drawData = await api.draws.getById(drawCode);
  } catch {
    notFound();
  }

  const { draw, ticketsSold } = drawData;
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const displayDrawName = getCustomerDrawName(draw);
  const displayDrawSubtitle = getCustomerDrawSubtitle(draw);
  const ticketCap = isJackpot ? null : 6000;
  const soldPercentage = ticketCap ? Math.min(100, (ticketsSold / ticketCap) * 100) : 0;

  const seedHash = '9f4c2b8e1a7d6f30c5e9b2148a6d4f7c2c6e9a4b7d0f3e6c1a5b8d';
  const seedCommittedAt = '00:00 WAT';

  return (
    <main>
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pb-12 pt-32 sm:pt-36 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <Link
            href="/draws"
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to active draws
          </Link>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                  {drawTypeShortLabel[draw.drawType]}
                </Badge>

                <Badge variant="live" withDot>
                  Live · selling now
                </Badge>

                <span className="inline-flex items-center gap-2 rounded-sm bg-white/80 px-3 py-1.5 text-xs font-bold text-navy-700 shadow-sm backdrop-blur">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Regulated draw
                </span>
              </div>

              <h1 className="max-w-4xl font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
                {displayDrawName}
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
                {displayDrawSubtitle} Every draw publishes public records, ticket references,
                and verifiable RNG seed hash after the draw.
              </p>

              <div className="mt-8 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
                <DetailStat label="Ticket type" value={isJackpot ? 'Jackpot' : 'Regular'} />
                <DetailStat label="Ticket price" value={formatNaira(draw.ticketPriceNgn)} />
                <DetailStat label="Closes in" value={formatCountdown(draw.cutoffAt)} mono />
                <DetailStat
                  label="Cutoff time"
                  value={new Date(draw.cutoffAt).toLocaleTimeString('en-NG', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                  mono
                />
              </div>
            </div>

            <div className="hidden lg:block">
              <BuyTicketPanel draw={draw} />
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-[#F8FAF4]">
        <Container size="lg" className="max-w-[1400px] py-10 lg:py-14">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <Card
                variant="default"
                className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.07)]"
              >
                <div
                  className={
                    isJackpot
                      ? 'relative min-h-[440px] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.18)_0%,rgba(245,158,11,0.08)_28%,transparent_58%),linear-gradient(135deg,#ffffff_0%,#fff7db_55%,#E8F0FB_100%)]'
                      : 'relative min-h-[440px] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(22,89,150,0.12)_0%,rgba(22,89,150,0.06)_28%,transparent_58%),linear-gradient(135deg,#ffffff_0%,#F5F8FF_55%,#E8F0FB_100%)]'
                  }
                >
                  <div className="absolute left-6 top-6 z-20 flex gap-2">
                    <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                      {drawTypeShortLabel[draw.drawType]}
                    </Badge>
                    <Badge variant="live" withDot>
                      Live
                    </Badge>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    {isJackpot ? (
                      <div
                        className="flex h-32 w-32 items-center justify-center rounded-[2.25rem] bg-amber-500 text-navy-950 shadow-[0_34px_80px_rgba(245,158,11,0.25)]"
                        aria-label={displayDrawName}
                      >
                        <Trophy className="h-16 w-16" />
                      </div>
                    ) : (
                      <RegularPrizeCategories />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 border-t border-slate-100 md:grid-cols-3">
                  <InfoCell
                    icon={<Ticket className="h-4 w-4" />}
                    title="Draw code"
                    value={draw.drawCode}
                  />
                  <InfoCell
                    icon={<Clock className="h-4 w-4" />}
                    title="Scheduled"
                    value={formatDrawDate(draw.scheduledAt)}
                  />
                  <InfoCell
                    icon={<Hash className="h-4 w-4" />}
                    title="Ticket type"
                    value={isJackpot ? 'Sure Jackpot ticket' : 'Regular daily ticket'}
                  />
                </div>
              </Card>

              <Card
                variant="default"
                className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                      Live demand
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                      {ticketsSold.toLocaleString()} tickets sold so far
                    </h2>
                  </div>

                  <div className="hidden rounded-sm bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:block">
                    Updated 12s ago
                  </div>
                </div>

                {ticketCap ? (
                  <>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-navy-800 transition-all"
                        style={{ width: `${soldPercentage}%` }}
                      />
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-slate-500">
                      Cap: {ticketCap.toLocaleString()} tickets per daily draw. Anything
                      above {ticketCap.toLocaleString()} is refunded automatically.
                    </p>
                  </>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-500">
                    The jackpot has no daily regular ticket cap. All valid jackpot tickets
                    enter the Saturday draw.
                  </p>
                )}
              </Card>

              <HowDrawWorks seedHash={seedHash} seedCommittedAt={seedCommittedAt} />
            </div>

            <div className="lg:hidden">
              <BuyTicketPanel draw={draw} />
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-28">
                <BuyTicketPanel draw={draw} />
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </main>
  );
}

const regularPrizeCategories = [
  'Small prize category',
  'Big prize category',
  'Mega prize category',
] as const;

function RegularPrizeCategories() {
  return (
    <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
      {regularPrizeCategories.map((label, index) => (
        <div
          key={label}
          className={
            index === 2
              ? 'flex min-h-[150px] flex-col items-center justify-center rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-5 text-center shadow-[0_24px_60px_rgba(245,158,11,0.16)]'
              : 'flex min-h-[150px] flex-col items-center justify-center rounded-[1.5rem] border border-navy-100 bg-white/80 px-4 py-5 text-center shadow-[0_18px_45px_rgba(1,58,168,0.10)]'
          }
        >
          <div
            className={
              index === 2
                ? 'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-navy-950'
                : 'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-white'
            }
          >
            <Gift className="h-7 w-7" />
          </div>
          <p className="text-sm font-black text-navy-950">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Part of today&apos;s named draw.
          </p>
        </div>
      ))}
    </div>
  );
}

interface DetailStatProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailStat({ label, value, mono }: DetailStatProps) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-navy-100 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur"
    >
      <p
        className={
          mono
            ? 'font-mono text-2xl font-black tracking-[-0.03em] text-navy-950 tabular-nums'
            : 'font-display text-2xl font-black tracking-[-0.03em] text-navy-950 tabular-nums'
        }
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
        {label}
      </p>
    </Card>
  );
}

function InfoCell({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="border-b border-slate-100 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="mb-2 flex items-center gap-2 text-navy-700">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.14em]">{title}</p>
      </div>
      <p className="font-semibold text-navy-950">{value}</p>
    </div>
  );
}
