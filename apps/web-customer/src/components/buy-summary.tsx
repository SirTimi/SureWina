import { Clock, Hash, Shield } from 'lucide-react';
import { Badge, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { drawTypeShortLabel, formatCountdown } from '@/lib/draw-helpers';

interface BuySummaryProps {
  draw: DrawPublic;
}

export function BuySummary({ draw }: BuySummaryProps) {
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const prizeImage = isJackpot ? '/images/jackpot-cash.webp' : '/images/draw-phone.webp';

  return (
    <div className="space-y-4">
      <Card
        variant="default"
        className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.10)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(1,58,168,0.10)_0%,rgba(1,58,168,0.06)_26%,transparent_58%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_55%,#F2F5FB_100%)]">
          <div className="absolute left-4 top-4 z-20 flex gap-2">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[draw.drawType]}
            </Badge>

            <Badge variant="live" withDot>
              Live
            </Badge>
          </div>

          <div className="absolute inset-0 flex items-center justify-center p-5">
            <img
              src={prizeImage}
              alt={draw.prizeDescription}
              className="h-[130%] w-[130%] object-contain drop-shadow-[0_28px_70px_rgba(15,23,42,0.18)]"
            />
          </div>
        </div>

        <div className="p-5">
          <h2 className="font-display text-xl font-black tracking-[-0.03em] text-navy-950">
            {draw.prizeDescription}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {isJackpot ? 'Prize' : 'Prize value'}
              </p>

              <p className="mt-1 font-display text-lg font-black text-navy-700 tabular-nums">
                {formatNaira(draw.prizeValueNgn)}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Closes in
              </p>

              <p className="mt-1 inline-flex items-center gap-1 font-mono text-lg font-black text-navy-950 tabular-nums">
                <Clock className="h-3.5 w-3.5 text-navy-700" />
                {formatCountdown(draw.cutoffAt)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card
        variant="default"
        className="rounded-3xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
          Why you can trust this purchase
        </h3>

        <ul className="space-y-3 text-xs leading-relaxed text-slate-600">
          <TrustItem icon={<Shield className="h-3.5 w-3.5" />}>
            Payment is processed by a secure gateway. We never see your card details.
          </TrustItem>

          <TrustItem icon={<Hash className="h-3.5 w-3.5" />}>
            Your ticket reference is issued by SMS and reflected in public draw records.
          </TrustItem>

          <TrustItem icon={<Clock className="h-3.5 w-3.5" />}>
            Failed payments don&apos;t consume your slot. Retry safely if anything fails.
          </TrustItem>
        </ul>
      </Card>
    </div>
  );
}

function TrustItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-emerald-50 text-emerald-700">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}