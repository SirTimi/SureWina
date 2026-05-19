'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Hash,
  Play,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
} from 'lucide-react';
import { Badge, Button, Card, Container } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { LiveDrawState } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

interface LiveDrawViewProps {
  drawCode: string;
}

const SLOT_COUNT = 8;

type StageKey = 'committed' | 'sorting' | 'running' | 'locked';

export function LiveDrawView({ drawCode }: LiveDrawViewProps) {
  const [state, setState] = useState<LiveDrawState | null>(null);
  const [countdown, setCountdown] = useState(12);
  const [slotValues, setSlotValues] = useState<string[]>(Array(SLOT_COUNT).fill('•'));
  const [drawStarted, setDrawStarted] = useState(false);

  useEffect(() => {
    api.claims.getLiveDraw(drawCode).then((res) => setState(res.state));
  }, [drawCode]);

  useEffect(() => {
    if (!drawStarted || countdown <= 0) return;

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, drawStarted]);

  useEffect(() => {
    if (!drawStarted) return;

    if (countdown > 0) {
      const t = setInterval(() => {
        setSlotValues((vals) =>
          vals.map(
            () =>
              'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[
                Math.floor(Math.random() * 31)
              ],
          ),
        );
      }, 80);

      return () => clearInterval(t);
    }

    const final = state?.winningTicketRef ?? 'SW-04AB-9LK2';
    const cleaned = final.replace(/-/g, '').slice(0, SLOT_COUNT).padEnd(SLOT_COUNT, '0');
    setSlotValues(cleaned.split(''));
  }, [countdown, drawStarted, state]);

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
      <main className="min-h-screen bg-[radial-gradient(circle_at_78%_28%,rgba(216,122,24,0.18)_0%,rgba(216,122,24,0.10)_28%,transparent_56%),linear-gradient(135deg,#ffffff_0%,#f4ffe8_48%,#E8F0FB_100%)] pt-32">
        <Container size="lg" className="max-w-[1400px] pb-16">
          <div className="h-[520px] animate-pulse rounded-3xl border border-slate-200 bg-white/80 shadow-[0_28px_80px_rgba(15,23,42,0.08)]" />
        </Container>
      </main>
    );
  }

  const isComplete = drawStarted && countdown === 0;

  const activeStage: StageKey = !drawStarted
    ? 'committed'
    : !isComplete
      ? 'running'
      : 'locked';

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
              {!drawStarted && (
                <>
                  Ready to
                  <br />
                  <span className="text-navy-700">run the draw.</span>
                </>
              )}

              {drawStarted && !isComplete && (
                <>
                  Drawing in
                  <br />
                  <span className="text-navy-700">{countdown}s.</span>
                </>
              )}

              {isComplete && (
                <>
                  Winner
                  <br />
                  <span className="text-navy-700">picked.</span>
                </>
              )}
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
              {!drawStarted &&
                'The seed hash is already committed and public. Start the draw to run the deterministic RNG.'}

              {drawStarted &&
                !isComplete &&
                'Ticket references are being sorted. The committed seed is being fed into the draw logic.'}

              {isComplete &&
                'The winning reference is now locked. Seed reveal can be checked against the earlier committed hash.'}
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
                        isComplete
                          ? 'flex h-16 items-center justify-center rounded-2xl border border-navy-200 bg-white text-center font-mono text-2xl font-black text-navy-700 shadow-[0_18px_50px_rgba(14,42,71,0.16)] sm:h-24 sm:text-4xl'
                          : drawStarted
                            ? 'flex h-16 items-center justify-center rounded-2xl border border-navy-100 bg-white/75 text-center font-mono text-2xl font-black text-navy-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:h-24 sm:text-4xl'
                            : 'flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-white/60 text-center font-mono text-2xl font-black text-slate-300 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur sm:h-24 sm:text-4xl'
                      }
                    >
                      {val}
                    </div>
                  ))}
                </div>

                {!drawStarted && (
                  <div className="mt-10 text-center">
                    <Button
                      onClick={() => setDrawStarted(true)}
                      variant="accent"
                      size="lg"
                      className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 shadow-[0_16px_34px_rgba(14,42,71,0.18)] hover:!border-transparent hover:bg-amber-400"
                    >
                      <Play className="h-4 w-4" />
                      Start the draw demo
                    </Button>
                  </div>
                )}

                {isComplete && state.winningTicketRef && (
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
                  done={drawStarted || isComplete}
                  title="Seed committed"
                  body="Hash published before draw execution."
                />
                <StageItem
                  active={drawStarted && !isComplete}
                  done={isComplete}
                  title="Tickets sorted"
                  body="All valid references enter deterministic ordering."
                />
                <StageItem
                  active={drawStarted && !isComplete}
                  done={isComplete}
                  title="RNG running"
                  body="Committed seed selects the winning index."
                />
                <StageItem
                  active={activeStage === 'locked'}
                  done={isComplete}
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                  Seed hash
                </p>
              </div>

              <p className="break-all rounded-2xl border border-navy-100 bg-[#F8FAF4] p-4 font-mono text-xs leading-relaxed text-slate-700">
                {state.seedHash}
              </p>

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                The seed was committed before the draw. After the draw, the original seed
                can be revealed and matched against this hash.
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