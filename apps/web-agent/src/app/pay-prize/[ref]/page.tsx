'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { api } from '@/lib/api';

interface LookupResult {
  ticketRef: string;
  isWinner: boolean;
  prizeDescription: string | null;
  grossPrizeValueNgn: number | null;
  claimStatus: string | null;
  agentPayableMaxNgn: number;
  agentPayable: boolean;
  reason: string | null;
}

export default function PayPrizeRefPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  return (
    <AgentShell>
      {() => <RefBody ref_={ref} />}
    </AgentShell>
  );
}

function RefBody({ ref_ }: { ref_: string }) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ amountNgn: number; reference: string } | null>(null);

  useEffect(() => {
    api.agents
      .prizeLookup(ref_)
      .then((r) => setResult(r))
      .catch((e) => setLookupError(e instanceof Error ? e.message : 'Lookup failed.'))
      .finally(() => setLoading(false));
  }, [ref_]);

  const pay = async () => {
    if (!result || !result.agentPayable) return;
    setPayError(null);
    setSubmitting(true);
    try {
      const res = await api.agents.prizeLogPayment(ref_);
      setPaid({ amountNgn: res.amountNgn, reference: res.reference });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Could not log payment.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  if (lookupError || !result) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <Card className="rounded-3xl border-red-200 bg-red-50 p-8 text-center">
          <XCircle className="mx-auto h-8 w-8 text-red-600" />
          <h2 className="mt-3 font-display text-xl font-black text-navy-950">Lookup failed</h2>
          <p className="mt-2 text-sm text-slate-600">{lookupError ?? 'Ticket not found.'}</p>
          <Link href="/pay-prize" className="mt-6 inline-block">
            <Button variant="accent" className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400">
              Try another reference
            </Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (paid) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <Card className="rounded-3xl border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-black text-navy-950">
            Prize payout logged
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Ticket <span className="font-mono font-black">{ref_}</span> marked paid ·{' '}
            {formatNaira(paid.amountNgn)}. Reference{' '}
            <span className="font-mono font-black">{paid.reference}</span>.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/pay-prize">
              <Button variant="secondary" className="rounded-sm border-navy-200 bg-white text-navy-700">
                Pay another prize
              </Button>
            </Link>
            <Link href="/">
              <Button variant="accent" className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400">
                Back to dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Pay prize · Verify"
        title="Verify ticket"
        description="Confirm the customer is the rightful holder before paying. Have them show ID."
        backHref="/pay-prize"
      />

      <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
        <div className={result.isWinner ? 'bg-navy-800 p-5 text-white' : 'bg-slate-900 p-5 text-white'}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
            Ticket reference
          </p>
          <p className="mt-2 font-mono text-3xl font-black tracking-[0.18em]">{result.ticketRef}</p>
          <p className="mt-3 text-sm">
            {result.isWinner ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Winning ticket · {result.prizeDescription}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Not a winner.
              </span>
            )}
          </p>
        </div>

        <div className="p-5">
          {result.isWinner && result.grossPrizeValueNgn !== null && (
            <div className="rounded-2xl border border-navy-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Prize amount
              </p>
              <p className="mt-1 font-display text-3xl font-black text-navy-950 tabular-nums">
                {formatNaira(result.grossPrizeValueNgn)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Agent-payable up to {formatNaira(result.agentPayableMaxNgn)}
              </p>
            </div>
          )}

          <div
            className={`mt-4 flex items-start gap-2 rounded-2xl border p-3 text-sm ${
              result.agentPayable
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {result.agentPayable ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {result.agentPayable
                ? 'This prize can be paid by you. Verify the holder, then log the payment.'
                : result.reason ?? 'This prize cannot be paid by an agent.'}
            </p>
          </div>

          {result.agentPayable && (
            <>
              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-[#F8FAF4] p-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-amber-400"
                />
                <p className="text-sm leading-relaxed text-slate-700">
                  I verified the customer&apos;s identity and confirm I am paying the prize
                  in full, in cash.
                </p>
              </label>

              {payError && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm">{payError}</p>
                </div>
              )}

              <Button
                variant="accent"
                size="lg"
                fullWidth
                disabled={!confirmed || submitting}
                isLoading={submitting}
                onClick={pay}
                className="mt-5 rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400 disabled:!bg-slate-200 disabled:text-slate-400"
              >
                <CheckCircle2 className="h-5 w-5" />
                Confirm &amp; log payment
              </Button>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}