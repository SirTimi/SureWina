'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { Card } from '@surewina/ui';
import { api } from '@/lib/api';

interface ProcessingPanelProps {
  sessionId: string;
  // Optional: the real values come from the purchase-status endpoint; these
  // are only fallbacks for the legacy in-app route.
  drawCode?: string;
  quantity?: number;
  phoneE164?: string;
}

type Stage = 'connecting' | 'authorising' | 'confirming';

export function ProcessingPanel({
  sessionId,
  drawCode,
  quantity,
  phoneE164,
}: ProcessingPanelProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('connecting');

  useEffect(() => {
    const t1 = setTimeout(() => setStage('authorising'), 1200);
    const t2 = setTimeout(() => setStage('confirming'), 2600);
    const t3 = setTimeout(async () => {
      try {
        const result = await api.tickets.confirmPurchase(
          sessionId,
          drawCode ?? '',
          quantity ?? 0,
          phoneE164 ?? '',
        );

        const params = new URLSearchParams({
          refs: result.ticketRefs.join(','),
          draw: result.drawCode,
          phone: result.buyerPhoneE164,
          paid: String(result.totalPaidNgn),
          newEntries: String(result.jackpotAccumulation.newJackpotEntries),
          cumCount: String(result.jackpotAccumulation.cumulativeCount),
          toNext: String(result.jackpotAccumulation.ticketsToNextEntry),
        });

        router.push(`/tickets/confirmation?${params.toString()}`);
      } catch {
        router.push(
          drawCode
            ? `/draws/${drawCode}/buy/failed?session=${sessionId}`
            : `/draws?payment=failed`,
        );
      }
    }, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [drawCode, sessionId, quantity, phoneE164, router]);

  const stageLabel: Record<Stage, string> = {
    connecting: 'Connecting to your bank…',
    authorising: 'Authorising payment…',
    confirming: 'Confirming and issuing your ticket…',
  };

  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-3xl border-slate-200 bg-white/95 p-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10"
    >
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-800 text-white">
          <CreditCard className="h-6 w-6" />
        </div>
      </div>

      <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white">
        <ShieldCheck className="h-4 w-4" />
        Secure processing
      </div>

      <h1 className="font-display text-3xl font-black tracking-[-0.03em] text-navy-950">
        Don&apos;t close this window.
      </h1>

      <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-500">
        We&apos;re completing your purchase. This usually takes a few seconds.
      </p>

      <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
        {(['connecting', 'authorising', 'confirming'] as const).map((s) => {
          const isActive = s === stage;
          const isDone =
            (s === 'connecting' && (stage === 'authorising' || stage === 'confirming')) ||
            (s === 'authorising' && stage === 'confirming');

          return (
            <div
              key={s}
              className={
                isActive
                  ? 'flex items-center gap-3 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-3 text-sm font-bold text-navy-950'
                  : isDone
                    ? 'flex items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3 text-sm font-bold text-navy-700'
                    : 'flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-400'
              }
            >
              {isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-navy-700" />
              ) : isDone ? (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-navy-800 text-white">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-200" />
              )}

              {stageLabel[s]}
            </div>
          );
        })}
      </div>

      <p className="mt-8 font-mono text-xs text-slate-400">Session: {sessionId}</p>
    </Card>
  );
}