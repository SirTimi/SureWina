'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Hash,
  Lock,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
} from 'lucide-react';
import { Badge, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { LiveDrawState } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface LiveDrawViewProps {
  drawCode: string;
}

const SLOT_COUNT = 8;
const WATCH_WINDOW_MS = 15 * 60 * 1000; // watchable from 15 min before draw
const POLL_MS = 8_000;
const REVEAL_SPIN_S = 6; // reveal animation length once the result is in

const SLOT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function LiveDrawView({ drawCode }: LiveDrawViewProps) {
  const [state, setState] = useState<LiveDrawState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null);
  const [slotValues, setSlotValues] = useState<string[]>(Array(SLOT_COUNT).fill('•'));
  // Tracks whether we watched the completion happen live (animate) or
  // arrived after the fact (show the locked result immediately).
  const sawPreComplete = useRef(false);

  // Real state, polled. The backend serves facts; this page is only theatre.
  useEffect(() => {
    let cancelled = false;
    const fetchState = () =>
      api.claims.getLiveDraw(drawCode).then((res) => {
        if (!cancelled) setState(res.state);
      }).catch(() => undefined);

    void fetchState();
    const t = setInterval(() => void fetchState(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [drawCode]);

  // Wall clock, for the lock/countdown displays.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Start the reveal animation exactly once, when COMPLETE arrives after we
  // watched an earlier phase live.
  useEffect(() => {
    if (!state) return;
    if (state.phase !== 'COMPLETE') {
      sawPreComplete.current = true;
      return;
    }
    if (state.phase === 'COMPLETE' && revealCountdown === null) {
      setRevealCountdown(sawPreComplete.current ? REVEAL_SPIN_S : 0);
    }
  }, [state, revealCountdown]);

  useEffect(() => {
    if (revealCountdown === null || revealCountdown <= 0) return;
    const t = setTimeout(() => setRevealCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [revealCountdown]);

  const isDrawing = state?.phase === 'DRAWING';
  const isRevealed = state?.phase === 'COMPLETE' && (revealCountdown ?? 0) <= 0;
  const isSpinning = isDrawing || (state?.phase === 'COMPLETE' && (revealCountdown ?? 0) > 0);

  // Slot contents: spin while drawing/revealing; lock to the real ref after.
  useEffect(() => {
    if (isSpinning) {
      const t = setInterval(() => {
        setSlotValues((vals) =>
          vals.map(() => SLOT_ALPHABET[Math.floor(Math.random() * SLOT_ALPHABET.length)]),
        );
      }, 80);
      return () => clearInterval(t);
    }
    if (isRevealed && state?.winningTicketRef) {
      const cleaned = state.winningTicketRef
        .replace(/^SW-/, '')
        .replace(/-/g, '')
        .slice(0, SLOT_COUNT)
        .padEnd(SLOT_COUNT, '•');
      setSlotValues(cleaned.split(''));
    }
  }, [isSpinning, isRevealed, state?.winningTicketRef]);

  if (!state) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32">
        <Container size="lg" className="max-w-[1400px] pb-16">
          <div className="h-[520px] animate-pulse rounded-3xl border border-slate-200 bg-white/80 shadow-[0_28px_80px_rgba(15,23,42,0.08)]" />
        </Container>
      </main>
    );
  }

  const scheduledMs = new Date(state.scheduledAt).getTime();
  const opensAt = scheduledMs - WATCH_WINDOW_MS;
  const isLocked = state.phase === 'PRE_DRAW' && now < opensAt;

  // ── LOCKED: the draw room hasn't opened yet ──
  if (isLocked) {
    const msLeft = Math.max(0, opensAt - now);
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    const s = Math.floor((msLeft % 60_000) / 1000);

    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32">
        <Container size="sm" className="pb-16">
          <Link
            href={`/draws/${drawCode}`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to draw
          </Link>

          <Card
            variant="default"
            className="rounded-3xl border-slate-200 bg-white/95 p-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10"
          >
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-navy-50 text-navy-700">
              <Lock className="h-7 w-7" />
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-white">
              <ShieldCheck className="h-4 w-4" />
              Live draw · {state.drawCode}
            </div>

            <h1 className="font-display text-4xl font-black tracking-[-0.03em] text-navy-950">
              The draw room opens soon.
            </h1>

            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-500">
              Watching opens 15 minutes before the draw runs. The RNG seed hash
              below was committed before tickets could sell — check it against
              the reveal after the draw.
            </p>

            <p className="mt-8 font-display text-5xl font-black tabular-nums text-navy-950">
              {h > 0 ? `${h}h ` : ''}
              {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              until the room opens · draw at {formatDrawTime(state.scheduledAt)}
            </p>

            <p className="mt-8 break-all rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4 font-mono text-xs leading-relaxed text-slate-600">
              Seed hash: {state.seedHash || 'committing…'}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              {state.ticketsSold.toLocaleString()} tickets sold so far
            </p>
          </Card>
        </Container>
      </main>
    );
  }

  const activeStage =
    state.phase === 'PRE_DRAW' ? 'committed' : state.phase === 'DRAWING' || isSpinning ? 'running' : 'locked';

  const secondsToDraw = Math.max(0, Math.floor((scheduledMs - now) / 1000));
  const cdM = Math.floor(secondsToDraw / 60);
  const cdS = secondsToDraw % 60;

  return (
    <main className="min-h-screen bg-[#F8FAF4]">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pb-12 pt-32 sm:pt-36 lg:pt-40">
        <div className="absolute right-[-8%] top-1/2 hidden h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-navy-50 blur-3xl lg:block" />
        <div className="absolute bottom-[-120px] left-[18%] h-80 w-80 rounded-full bg-navy-50 blur-3xl" />

        <Container size="lg" className="relative max-w-[1400px]">
          <Link
            href={`/draws/${drawCode}`}
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to draw
          </Link>

          <div className="max-w-4xl">
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Badge variant={state.drawType === 'SATURDAY_JACKPOT' ? 'jackpot' : 'daily'}>
                {drawTypeShortLabel[state.drawType]}
              </Badge>

              <span className="inline-flex items-center gap-2 rounded-sm border border-white/30 bg-navy-700/90 px-4 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-white" />
                Live draw · public verification
              </span>
            </div>

            <h1 className="font-display text-5xl font-black leading-[0.98] tracking-[-0.05em] text-navy-950 sm:text-6xl lg:text-7xl">
              {state.phase === 'PRE_DRAW' && (
                <>
                  Draw runs
                  <br />
                  <span className="text-navy-700">
                    {secondsToDraw > 0 ? `in ${cdM}m ${String(cdS).padStart(2, '0')}s.` : 'any moment.'}
                  </span>
                </>
              )}

              {isSpinning && (
                <>
                  Drawing
                  <br />
                  <span className="text-navy-700">now.</span>
                </>
              )}

              {isRevealed && (
                <>
                  Winner
                  <br />
                  <span className="text-navy-700">picked.</span>
                </>
              )}
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              {state.phase === 'PRE_DRAW' &&
                'The seed hash is committed and public. When the clock hits zero, the engine locks the ticket pool and runs the deterministic RNG.'}
              {isSpinning &&
                'The engine is locking the pool and feeding the committed seed into the draw logic.'}
              {isRevealed &&
                'The winning reference is locked. The revealed seed can be checked against the committed hash — by anyone.'}
            </p>
          </div>
        </Container>
      </section>

      <Container size="lg" className="max-w-[1400px] py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card
            variant="default"
            className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
          >
            <div className="border-b border-slate-100 bg-[#F8FAF4] px-6 py-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                    Draw stage
                  </p>
                  <p className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
                    {state.prizeDescription}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 rounded-sm bg-white px-3 py-2 text-xs font-bold text-navy-700 shadow-sm">
                  <Ticket className="h-4 w-4" />
                  {state.ticketsSold.toLocaleString()} tickets sold
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(216,122,24,0.14)_0%,rgba(216,122,24,0.10)_30%,transparent_62%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_55%,#E8F0FB_100%)] px-5 py-12 sm:px-8 sm:py-16">
              <div className="mx-auto max-w-4xl">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-3">
                  {slotValues.map((val, i) => (
                    <div
                      key={`${i}-${val}`}
                      className={
                        isRevealed
                          ? 'flex h-16 items-center justify-center rounded-2xl border border-navy-200 bg-white text-center font-mono text-2xl font-black text-navy-700 shadow-[0_18px_50px_rgba(14,42,71,0.16)] sm:h-24 sm:text-4xl'
                          : isSpinning
                            ? 'flex h-16 items-center justify-center rounded-2xl border border-navy-100 bg-white/75 text-center font-mono text-2xl font-black text-navy-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:h-24 sm:text-4xl'
                            : 'flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-white/60 text-center font-mono text-2xl font-black text-slate-300 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur sm:h-24 sm:text-4xl'
                      }
                    >
                      {val}
                    </div>
                  ))}
                </div>

                {isRevealed && state.winningTicketRef && (
                  <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-navy-100 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-col gap-4 text-center sm:flex-row sm:items-center sm:text-left">
                      <div className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700 sm:mx-0">
                        <Trophy className="h-7 w-7" />
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                          Winning ticket
                        </p>
                        <p className="mt-1 font-mono text-2xl font-black tracking-wider text-navy-950">
                          {state.winningTicketRef}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Is this your ticket?{' '}
                          <Link
                            href="/sign-in?next=/dashboard/claims"
                            className="font-bold text-navy-700 hover:text-navy-800"
                          >
                            Sign in to claim your prize
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <aside className="space-y-4">
            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Verification status
              </p>

              <div className="mt-5 space-y-3">
                <StageItem
                  active={activeStage === 'committed'}
                  done={activeStage !== 'committed'}
                  title="Seed committed"
                  body="Hash published before draw execution."
                />
                <StageItem
                  active={activeStage === 'running'}
                  done={isRevealed}
                  title="Tickets locked"
                  body="All valid references enter deterministic ordering."
                />
                <StageItem
                  active={activeStage === 'running'}
                  done={isRevealed}
                  title="RNG running"
                  body="Committed seed selects the winning index."
                />
                <StageItem
                  active={activeStage === 'locked'}
                  done={isRevealed}
                  title="Winner locked"
                  body="Winning reference becomes permanent."
                />
              </div>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Draw details
              </p>

              <div className="mt-5 space-y-4">
                <DetailRow label="Draw date" value={formatDrawDate(state.scheduledAt)} />
                <DetailRow label="Draw time" value={formatDrawTime(state.scheduledAt)} />
                <DetailRow label="Prize value" value={formatNaira(state.prizeValueNgn)} />
                <DetailRow label="Tickets sold" value={state.ticketsSold.toLocaleString()} />
              </div>
            </Card>

            <Card
              variant="default"
              className="rounded-3xl border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
            >
              <div className="mb-3 flex items-center gap-2 text-navy-700">
                <Hash className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Seed hash</p>
              </div>

              <p className="break-all rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4 font-mono text-xs leading-relaxed text-slate-700">
                {state.seedHash || 'committing…'}
              </p>

              {isRevealed && state.seedReveal && (
                <>
                  <div className="mb-3 mt-5 flex items-center gap-2 text-navy-700">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                      Seed revealed
                    </p>
                  </div>
                  <p className="break-all rounded-2xl border border-amber-200 bg-amber-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                    {state.seedReveal}
                  </p>
                </>
              )}

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                The seed was committed before the draw. After the draw, the revealed seed can
                be matched against this hash — by anyone, with the public verifier.
              </p>

              <Link
                href={`/results/${drawCode}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy-700 transition hover:text-navy-800"
              >
                View result archive
                <Sparkles className="h-4 w-4" />
              </Link>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function StageItem({
  active,
  done,
  title,
  body,
}: {
  active?: boolean;
  done?: boolean;
  title: string;
  body: string;
}) {
  return (
    <div
      className={
        done
          ? 'rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4'
          : active
            ? 'rounded-2xl border border-navy-200 bg-amber-50 p-4'
            : 'rounded-2xl border border-slate-100 bg-white p-4'
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            done
              ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-navy-800 text-white'
              : active
                ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-amber-500 text-navy-950'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-400'
          }
        >
          {done ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </div>

        <div>
          <p className="text-sm font-black text-navy-950">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <span className="text-right text-sm font-black text-navy-950">{value}</span>
    </div>
  );
}