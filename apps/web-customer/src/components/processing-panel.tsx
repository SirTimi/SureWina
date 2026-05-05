'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CreditCard } from 'lucide-react';
import { Card } from '@surewina/ui';
import { api } from '@/lib/api';

interface ProcessingPanelProps {
  drawCode: string;
  sessionId: string;
  quantity: number;
  phoneE164: string;
}

export function ProcessingPanel({ drawCode, sessionId, quantity, phoneE164 }: ProcessingPanelProps) {
  const router = useRouter();
  const [stage, setStage] = useState<'connecting' | 'authorising' | 'confirming'>('connecting');

  useEffect(() => {
    const t1 = setTimeout(() => setStage('authorising'), 1200);
    const t2 = setTimeout(() => setStage('confirming'), 2600);
    const t3 = setTimeout(async () => {
      try {
        const result = await api.tickets.confirmPurchase(sessionId, drawCode, quantity, phoneE164);
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
        router.push(`/draws/${drawCode}/buy/failed?session=${sessionId}`);
      }
    }, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [drawCode, sessionId, quantity, phoneE164, router]);

  const stageLabel: Record<typeof stage, string> = {
    connecting: 'Connecting to your bank…',
    authorising: 'Authorising payment…',
    confirming: 'Confirming and issuing your ticket…',
  };

  return (
    <Card variant="default" className="p-8 sm:p-10 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-navy-50 mb-5">
        <CreditCard className="w-6 h-6 text-navy-800" />
      </div>
      <h1 className="font-display text-2xl font-bold text-ink-950">Don&apos;t close this window</h1>
      <p className="text-ink-500 mt-2 text-base">
        We&apos;re completing your purchase. This usually takes a few seconds.
      </p>

      <div className="mt-8 space-y-3 text-left max-w-xs mx-auto">
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
                  ? 'flex items-center gap-3 text-sm text-ink-950 font-medium'
                  : isDone
                  ? 'flex items-center gap-3 text-sm text-success'
                  : 'flex items-center gap-3 text-sm text-ink-300'
              }
            >
              {isActive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isDone ? (
                <span className="w-4 h-4 rounded-full bg-success text-white text-[10px] inline-flex items-center justify-center">
                  ✓
                </span>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-ink-200 inline-block" />
              )}
              {stageLabel[s]}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-300 mt-8 font-mono">Session: {sessionId}</p>
    </Card>
  );
}