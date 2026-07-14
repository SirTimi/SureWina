import Link from 'next/link';
import { Gift, Trophy, Users } from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { drawTypeShortLabel, formatCountdown } from '@/lib/draw-helpers';
import {
  getCustomerDrawName,
  getCustomerDrawSubtitle,
} from '@/lib/customer-draw-display';

interface DrawCardProps {
  draw: DrawPublic;
  ticketsSold?: number;
}

export function DrawCard({ draw, ticketsSold }: DrawCardProps) {
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const Icon = isJackpot ? Trophy : Gift;
  const displayDrawName = getCustomerDrawName(draw);
  const displaySubtitle = getCustomerDrawSubtitle(draw);

  return (
    <Card
      variant="default"
      className="flex flex-col overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
    >
      <div
        className={
          isJackpot
            ? 'relative aspect-[16/9] overflow-hidden border-b border-slate-100 bg-gradient-to-br from-amber-50 via-white to-navy-50'
            : 'relative aspect-[16/9] overflow-hidden border-b border-slate-100 bg-gradient-to-br from-navy-50 via-white to-amber-50'
        }
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.14),transparent_24%),radial-gradient(circle_at_85%_25%,rgba(245,158,11,0.18),transparent_24%)]" />

        <div className="relative z-10 flex h-full w-full items-center justify-center">
          <div
            className={
              isJackpot
                ? 'flex h-24 w-24 items-center justify-center rounded-[2rem] bg-amber-500 text-navy-950 shadow-[0_24px_60px_rgba(245,158,11,0.25)]'
                : 'flex h-24 w-24 items-center justify-center rounded-[2rem] bg-navy-800 text-white shadow-[0_24px_60px_rgba(1,58,168,0.22)]'
            }
          >
            <Icon className="h-12 w-12" />
          </div>
        </div>

        <div className="absolute left-4 top-4 z-20 flex gap-2">
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
          {displayDrawName}
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          {displaySubtitle}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Ticket
            </p>
            <p className="mt-1 font-display text-2xl font-black text-navy-950 tabular-nums">
              {formatNaira(draw.ticketPriceNgn)}
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
          ) : null}

          <Link href={`/draws/${draw.drawCode}`}>
            <Button variant="accent" size="sm" className="rounded-lg font-bold">
              Buy ticket
            </Button>
          </Link>
          <Link href={`/draws/${draw.drawCode}/live`} className="...secondary-button-classes...">
            Watch live draw
          </Link>
        </div>
      </div>
    </Card>
  );
}
