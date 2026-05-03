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
    <Card variant="default" className="flex flex-col overflow-hidden">
      <div className="relative bg-ink-50 aspect-[4/3] flex items-center justify-center border-b border-ink-100">
        <span className="text-xs text-ink-300 font-mono">[ product shot · 4:3 ]</span>
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
            {drawTypeShortLabel[draw.drawType]}
          </Badge>
          <Badge variant="live" withDot>
            Live
          </Badge>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-display text-lg font-semibold text-ink-950">
          {draw.prizeDescription}
        </h3>
        <p className="text-sm text-ink-500 mt-0.5">
          {isJackpot
            ? 'Guaranteed cash prize · paid to verified bank account'
            : 'Brand new, sealed retail'}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-ink-100">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
              {isJackpot ? 'Guaranteed prize' : 'Prize value'}
            </p>
            <p className="text-xl font-display font-bold text-ink-950 tabular-nums mt-0.5">
              {formatNaira(draw.prizeValueNgn)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">
              Closes in
            </p>
            <p className="text-xl font-display font-bold text-ink-950 tabular-nums mt-0.5 font-mono">
              {formatCountdown(draw.cutoffAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-ink-100">
          {ticketsSold !== undefined && (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-500">
              <Users className="w-4 h-4" />
              <span className="tabular-nums">{ticketsSold.toLocaleString()}</span> tickets sold
            </span>
          )}
          <Link href={`/draws/${draw.drawCode}`}>
            <Button variant={isJackpot ? 'accent' : 'primary'} size="sm">
              Buy ticket — {formatNaira(draw.ticketPriceNgn)}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}