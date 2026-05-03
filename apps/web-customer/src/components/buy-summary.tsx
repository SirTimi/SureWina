import { Shield, Hash, Clock } from 'lucide-react';
import { Badge, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DrawPublic } from '@surewina/types';
import { drawTypeShortLabel, formatCountdown } from '@/lib/draw-helpers';

interface BuySummaryProps {
  draw: DrawPublic;
}

export function BuySummary({ draw }: BuySummaryProps) {
  const isJackpot = draw.drawType === 'SATURDAY_JACKPOT';

  return (
    <div className="sticky top-6 space-y-4">
      <Card variant="default" className="overflow-hidden">
        <div className="bg-ink-50 aspect-[4/3] flex items-center justify-center border-b border-ink-100">
          <span className="text-xs text-ink-300 font-mono">[ product shot · 4:3 ]</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[draw.drawType]}
            </Badge>
            <Badge variant="live" withDot>
              Live
            </Badge>
          </div>
          <h2 className="font-display text-lg font-semibold text-ink-950">
            {draw.prizeDescription}
          </h2>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-ink-100">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                {isJackpot ? 'Prize' : 'Prize value'}
              </p>
              <p className="font-display text-base font-bold text-ink-950 tabular-nums mt-0.5">
                {formatNaira(draw.prizeValueNgn)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                Closes in
              </p>
              <p className="font-display text-base font-bold text-ink-950 tabular-nums mt-0.5 font-mono inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatCountdown(draw.cutoffAt)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card variant="default" className="p-5">
        <h3 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-3">
          Why you can trust this purchase
        </h3>
        <ul className="space-y-3 text-xs text-ink-700 leading-relaxed">
          <li className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-navy-800 flex-shrink-0 mt-0.5" />
            <span>
              Payment processed by Paystack/Flutterwave — PCI-DSS compliant. We never see your
              card details.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Hash className="w-3.5 h-3.5 text-navy-800 flex-shrink-0 mt-0.5" />
            <span>
              Your ticket reference is published in the public archive after the draw. Permanent
              proof of entry.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 text-navy-800 flex-shrink-0 mt-0.5" />
            <span>
              Failed payments don&apos;t consume your slot. If anything fails, retry without
              losing the form.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}