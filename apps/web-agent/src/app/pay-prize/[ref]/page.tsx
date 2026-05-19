'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock } from '@/lib/agent-mock';

type Result = Awaited<ReturnType<typeof agentMock.lookupPrizeTicket>>;

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
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [customerPhone, setCustomerPhone] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    agentMock.lookupPrizeTicket(ref_).then((r) => {
      setResult(r);
      setLoading(false);
    });
  }, [ref_]);

  const pay = async () => {
    if (!result || !result.canAgentPay || result.prizeValueNgn === null) return;
    setSubmitting(true);
    await agentMock.logPrizePayment({
      ticketRef: ref_,
      paidNgn: result.prizeValueNgn,
      method,
      customerPhone: customerPhone.trim() || null,
    });
    setPaid(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  if (!result) return null;

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
            Ticket <span className="font-mono font-black">{ref_}</span> marked paid via{' '}
            {method.toLowerCase()}. Customer receives an SMS receipt shortly.
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
        description="Confirm the customer is the rightful holder before paying. Have them show ID for prizes over ₦5,000."
        backHref="/pay-prize"
      />

      <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
        <div
          className={
            result.isWinner
              ? 'bg-navy-800 p-5 text-white'
              : 'bg-slate-900 p-5 text-white'
          }
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
            Ticket reference
          </p>
          <p className="mt-2 font-mono text-3xl font-black tracking-[0.18em]">{ref_}</p>
          <p className="mt-3 text-sm">
            {!result.found ? (
              <span className="inline-flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Not found in the ticket database.
              </span>
            ) : result.isWinner ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Winning ticket ·{' '}
                {result.prizeDescription}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Not a winner.
              </span>
            )}
          </p>
        </div>

        <div className="p-5">
          {result.isWinner && result.prizeValueNgn !== null && (
            <div className="rounded-2xl border border-navy-100 bg-amber-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Prize amount
              </p>
              <p className="mt-1 font-display text-3xl font-black text-navy-950 tabular-nums">
                {formatNaira(result.prizeValueNgn)}
              </p>
            </div>
          )}

          <div
            className={`mt-4 flex items-start gap-2 rounded-2xl border p-3 text-sm ${
              result.canAgentPay
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {result.canAgentPay ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>{result.note}</p>
          </div>

          {result.canAgentPay && (
            <>
              <div className="mt-5">
                <p className="mb-2 text-sm font-bold text-navy-950">Payment method</p>
                <div className="grid grid-cols-2 gap-2">
                  <MethodChip
                    label="Cash"
                    icon={<Banknote className="h-4 w-4" />}
                    selected={method === 'CASH'}
                    onClick={() => setMethod('CASH')}
                  />
                  <MethodChip
                    label="Transfer"
                    icon={<CreditCard className="h-4 w-4" />}
                    selected={method === 'TRANSFER'}
                    onClick={() => setMethod('TRANSFER')}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="phone"
                  className="mb-2 flex items-center justify-between text-sm font-bold text-navy-950"
                >
                  Customer phone{' '}
                  <span className="text-xs font-medium text-slate-400">For SMS receipt</span>
                </label>
                <input
                  id="phone"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="080…"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-[#F8FAF4] p-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-amber-400"
                />
                <p className="text-sm leading-relaxed text-slate-700">
                  I verified the customer&apos;s identity and confirm I am paying the prize
                  in full.
                </p>
              </label>

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
                Confirm & log payment
              </Button>
            </>
          )}

          {!result.canAgentPay && result.requiresKyc && (
            <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                Direct them to the Surewina customer app — they need KYC verification
                before this prize can be paid. You earn the same commission either way.
              </p>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}

function MethodChip({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? 'flex items-center justify-center gap-2 rounded-2xl border-2 border-navy-700 bg-amber-50 px-4 py-3 text-sm font-black text-navy-950'
          : 'flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700'
      }
    >
      {icon}
      {label}
    </button>
  );
}
