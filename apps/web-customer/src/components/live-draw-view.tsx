'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hash, Play, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { Button, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { LiveDrawState } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface LiveDrawViewProps {
  drawCode: string;
}

const SLOT_COUNT = 8;

export function LiveDrawView({ drawCode }: LiveDrawViewProps) {
  const [state, setState] = useState<LiveDrawState | null>(null);
  const [countdown, setCountdown] = useState(12);
  const [slotValues, setSlotValues] = useState<string[]>(Array(SLOT_COUNT).fill('•'));
  const [drawStarted, setDrawStarted] = useState(false);

  // Initial fetch
  useEffect(() => {
    api.claims.getLiveDraw(drawCode).then((res) => setState(res.state));
  }, [drawCode]);

  // Countdown ticker
  useEffect(() => {
    if (!drawStarted) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, drawStarted]);

  // Slot animation when drawing
  useEffect(() => {
    if (!drawStarted) return;
    if (countdown > 0) {
      // Roulette mode — random characters scramble
      const t = setInterval(() => {
        setSlotValues((vals) =>
          vals.map(() => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]),
        );
      }, 80);
      return () => clearInterval(t);
    }
    // Lock final winning ticket once countdown hits 0
    const final = state?.winningTicketRef ?? 'SW-04AB-9LK2';
    const cleaned = final.replace(/-/g, '').slice(0, SLOT_COUNT).padEnd(SLOT_COUNT, '0');
    setSlotValues(cleaned.split(''));
  }, [countdown, drawStarted, state]);

  // Refresh state once countdown completes
  useEffect(() => {
    if (drawStarted && countdown === 0) {
      const t = setTimeout(() => {
        api.claims.getLiveDraw(drawCode).then((res) => setState(res.state));
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [countdown, drawStarted, drawCode]);

  if (!state) {
    return (
      <Container size="md" className="py-16">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      </Container>
    );
  }

  const isComplete = drawStarted && countdown === 0;

  return (
    <section className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-gradient-to-b from-navy-950 via-navy-950 to-[#08152a] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#A8E368]/40 to-transparent" />
      <div className="pointer-events-none absolute right-[-15%] top-[10%] h-[500px] w-[500px] rounded-full bg-[#A8E368]/8 blur-3xl" />
      <div className="pointer-events-none absolute left-[-10%] bottom-[10%] h-[400px] w-[400px] rounded-full bg-amber-500/8 blur-3xl" />

      <Container size="md" className="relative z-10 max-w-[820px] py-16 text-center lg:py-24">
        {/* Eyebrow */}
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#A8E368]">
          {drawTypeShortLabel[state.drawType]} · {formatDrawDate(state.scheduledAt)} ·{' '}
          {formatDrawTime(state.scheduledAt)}
        </div>

        {/* Headline */}
        <h1 className="font-display text-5xl font-black leading-[1.02] tracking-[-0.04em] sm:text-6xl">
          {!drawStarted && 'Ready to draw'}
          {drawStarted && !isComplete && (
            <>
              Drawing in <span className="text-[#A8E368]">{countdown}s</span>
            </>
          )}
          {isComplete && <span className="text-[#A8E368]">Winner picked.</span>}
        </h1>

        {!isComplete && (
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
            {drawStarted
              ? 'Sit tight. The seed is being fed to the deterministic RNG. The winning index will lock when the timer hits zero.'
              : 'The seed hash is committed and public. Press start to run the draw.'}
          </p>
        )}

        {isComplete && state.winningTicketRef && (
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
            Seed has been revealed. Anyone can re-hash the seed and confirm it matches what we
            published before the draw.
          </p>
        )}

        {/* Slot row */}
        <div className="mt-12 flex justify-center gap-2 sm:gap-3">
          {slotValues.map((val, i) => (
            <div
              key={i}
              className={`flex h-16 w-12 items-center justify-center rounded-xl border font-mono text-2xl font-black tabular-nums transition-all sm:h-20 sm:w-16 sm:text-3xl ${
                isComplete
                  ? 'border-[#A8E368]/60 bg-[#A8E368]/15 text-[#A8E368] shadow-[0_0_30px_rgba(168,227,104,0.25)]'
                  : drawStarted
                  ? 'border-white/20 bg-white/5 text-white/80'
                  : 'border-white/10 bg-white/5 text-white/30'
              }`}
            >
              {val}
            </div>
          ))}
        </div>

        {/* Action area */}
        {!drawStarted && (
          <Button
            onClick={() => setDrawStarted(true)}
            variant="accent"
            size="lg"
            className="mt-12 rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 shadow-[0_16px_34px_rgba(78,143,1,0.22)] hover:!border-transparent hover:bg-[#B7EF79]"
          >
            <Play className="h-4 w-4" />
            Start the draw (demo)
          </Button>
        )}

        {isComplete && state.winningTicketRef && (
          <div className="mx-auto mt-10 inline-flex flex-col gap-3 rounded-2xl border border-[#A8E368]/30 bg-[#A8E368]/8 px-8 py-6 sm:flex-row sm:items-center sm:gap-6">
            <Trophy className="h-8 w-8 text-[#A8E368]" />
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8E368]">
                Winning ticket
              </p>
              <p className="mt-1 font-mono text-xl font-bold tracking-wider text-white">
                {state.winningTicketRef}
              </p>
            </div>
          </div>
        )}

        {/* Stat strip */}
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              Tickets sold
            </p>
            <p className="mt-2 font-display text-2xl font-black tabular-nums">
              {state.ticketsSold.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              Prize
            </p>
            <p className="mt-2 font-display text-base font-bold leading-tight">
              {state.prizeDescription}
            </p>
            <p className="mt-1 text-xs text-[#A8E368] tabular-nums">
              {formatNaira(state.prizeValueNgn)}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
              Seed hash
            </p>
            <p className="mt-2 truncate font-mono text-sm text-white/80">
              {state.seedHash.slice(0, 16)}…
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="mx-auto max-w-md text-xs text-white/50">
            The seed was committed at 00:00 WAT today. After this draw closes, the original seed
            will be revealed at{' '}
            <Link
              href={`/results/${drawCode}`}
              className="text-[#A8E368] hover:underline"
            >
              surewina.ng/results
            </Link>{' '}
            for verification.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
            <ShieldCheck className="h-3.5 w-3.5 text-[#A8E368]" />
            Licensed · NLRC #NL/2025/0241
          </div>
        </div>
      </Container>
    </section>
  );
}