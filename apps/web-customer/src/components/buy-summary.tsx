import { Clock, Gift, Hash, Shield, Trophy } from 'lucide-react';
import { Badge, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { drawTypeShortLabel, formatCountdown } from '@/lib/draw-helpers';
import {
  getCustomerDrawName,
  getCustomerDrawSubtitle,
  getTicketTypeLabel,
} from '@/lib/customer-draw-display';

interface BuySummaryProps {
  draw: DrawPublic;
  quantity?: number;
}

export function BuySummary({ draw, quantity = 1 }: BuySummaryProps) {
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';
  const displayDrawName = getCustomerDrawName(draw);
  const subtitle = getCustomerDrawSubtitle(draw);
  const ticketType = getTicketTypeLabel(draw);
  const total = quantity * draw.ticketPriceNgn;
  const Icon = isJackpot ? Trophy : Gift;

  return (
    <div className="space-y-4">
      <Card
        variant="default"
        className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.10)]"
      >
        <div
          className={
            isJackpot
              ? 'relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(245,158,11,0.18)_0%,rgba(245,158,11,0.08)_28%,transparent_58%),linear-gradient(135deg,#ffffff_0%,#fff7db_55%,#E8F0FB_100%)]'
              : 'relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(22,89,150,0.12)_0%,rgba(22,89,150,0.06)_28%,transparent_58%),linear-gradient(135deg,#ffffff_0%,#F5F8FF_55%,#E8F0FB_100%)]'
          }
        >
          <div className="absolute left-4 top-4 z-20 flex gap-2">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[draw.drawType]}
            </Badge>

            <Badge variant="live" withDot>
              Live
            </Badge>
          </div>

          <div className="absolute inset-0 flex items-center justify-center p-5">
            <div
              className={
                isJackpot
                  ? 'flex h-28 w-28 items-center justify-center rounded-[2rem] bg-amber-500 text-navy-950 shadow-[0_28px_70px_rgba(245,158,11,0.25)]'
                  : 'flex h-28 w-28 items-center justify-center rounded-[2rem] bg-navy-800 text-white shadow-[0_28px_70px_rgba(1,58,168,0.22)]'
              }
            >
              <Icon className="h-14 w-14" />
            </div>
          </div>
        </div>

        <div className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
            {ticketType}
          </p>

          <h2 className="mt-1 font-display text-xl font-black tracking-[-0.03em] text-navy-950">
            {displayDrawName}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {subtitle}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <SummaryStat label="Quantity" value={quantity.toLocaleString('en-NG')} />
            <SummaryStat label="Total" value={formatNaira(total)} />
            <SummaryStat label="Ticket price" value={formatNaira(draw.ticketPriceNgn)} />
            <SummaryStat label="Closes in" value={formatCountdown(draw.cutoffAt)} mono />
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

function SummaryStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-navy-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className={mono ? 'mt-1 font-mono text-sm font-black text-navy-950' : 'mt-1 font-display text-sm font-black text-navy-950'}>
        {value}
      </p>
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
