import Link from 'next/link';
import { Users } from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { drawTypeShortLabel, formatCountdown } from '@/lib/draw-helpers';

interface DrawCardProps {
  draw: DrawPublic;
  ticketsSold?: number;
}

export function DrawCard({ draw, ticketsSold }: DrawCardProps) {
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';

  return (
    <Card
      variant="default"
      className="flex flex-col overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-amber-50">
        <div className="relative z-10 flex h-full w-full items-center justify-center">
  <img
    src={isJackpot ? '/images/jackpot-cash.webp' : '/images/draw-phone.webp'}
    alt={draw.prizeDescription}
    className={
      isJackpot
        ? 'h-[82%] w-[82%] object-contain'
        : 'h-[88%] w-[88%] object-contain'
    }
  />
</div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.16),transparent_22%),radial-gradient(circle_at_85%_25%,rgba(245,158,11,0.18),transparent_22%)]" />

        <div className="absolute left-4 top-4 flex gap-2">
          <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
            {drawTypeShortLabel[draw.drawType]}
          </Badge>
          <Badge variant="live" withDot>
            Live
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-bold text-navy-950">
          {draw.prizeDescription}
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          {isJackpot
            ? 'Guaranteed cash prize · paid to verified bank account'
            : 'Brand new, sealed retail'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {isJackpot ? 'Guaranteed prize' : 'Prize value'}
            </p>
            <p
              className={
                isJackpot
                  ? 'mt-1 font-display text-2xl font-black text-emerald-600 tabular-nums'
                  : 'mt-1 font-display text-2xl font-black text-blue-700 tabular-nums'
              }
            >
              {formatNaira(draw.prizeValueNgn)}
            </p>
          </div>

          <div className="border-l border-slate-100 pl-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Closes in
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-navy-950 tabular-nums">
              {formatCountdown(draw.cutoffAt)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          {ticketsSold !== undefined ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
              <Users className="h-4 w-4 text-navy-700" />
              <span className="tabular-nums">{ticketsSold.toLocaleString()}</span>
              tickets sold
            </span>
          ) : (
            <span />
          )}

          <Link href={`/draws/${draw.drawCode}`}>
            <Button
              variant={isJackpot ? 'accent' : 'primary'}
              size="sm"
              className={
                isJackpot
                  ? 'rounded-lg bg-amber-400 font-bold text-navy-950 hover:bg-amber-300'
                  : 'rounded-lg font-bold'
              }
            >
              Buy ticket — {formatNaira(draw.ticketPriceNgn)}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}