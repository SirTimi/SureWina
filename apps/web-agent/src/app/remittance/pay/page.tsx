'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Receipt } from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock } from '@/lib/agent-mock';

export default function PayRemittancePage() {
  return (
    <AgentShell>
      {() => <PayBody />}
    </AgentShell>
  );
}

function PayBody() {
  const router = useRouter();
  const [owed, setOwed] = useState<number>(0);
  const [reference, setReference] = useState<string>('');
  const [bankReceiptRef, setBankReceiptRef] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    agentMock.getRemittanceStatus().then((s) => {
      setOwed(s.owedNgn);
      setAmount(String(s.owedNgn));
      setReference(s.bankInstructions.reference);
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter the amount you transferred.');
      return;
    }
    if (bankReceiptRef.trim().length < 4) {
      setError('Enter the bank transfer reference from your banking app.');
      return;
    }

    setSubmitting(true);
    try {
      await agentMock.confirmRemittancePayment({
        amountNgn: amt,
        bankReceiptRef: bankReceiptRef.trim(),
      });
      setDone(true);
      setTimeout(() => router.push('/remittance/history'), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log payment.');
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
        <Card className="rounded-3xl border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-black text-navy-950">
            Remittance logged
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Finance will verify your bank receipt within 30 minutes. You can keep
            selling.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[640px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Remittance · Log payment"
        title="Log your bank transfer"
        description="Enter the amount you sent and the bank receipt reference. Finance reconciles within 30 minutes."
        backHref="/remittance"
      />

      <Card className="rounded-3xl border-[#4E8F01]/15 bg-[#A8E368]/15 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
          You owe
        </p>
        <p className="mt-1 font-display text-3xl font-black text-navy-950 tabular-nums">
          {formatNaira(owed)}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Use reference{' '}
          <span className="font-mono font-black text-[#4E8F01]">{reference}</span>{' '}
          when you transfer.
        </p>
      </Card>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
          <label
            htmlFor="amount"
            className="mb-2 block text-sm font-bold text-navy-950"
          >
            Amount transferred
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-display text-base font-black text-slate-400">
              ₦
            </span>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 font-display text-xl font-black text-navy-950 tabular-nums outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </div>

          <label
            htmlFor="receipt"
            className="mb-2 mt-5 block text-sm font-bold text-navy-950"
          >
            Bank receipt reference
          </label>
          <div className="relative">
            <Receipt className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="receipt"
              value={bankReceiptRef}
              onChange={(e) => setBankReceiptRef(e.target.value.toUpperCase())}
              placeholder="GTB-TRF-XXXXXX"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-mono text-base font-bold text-navy-950 outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            You&apos;ll find this in the success screen of your banking app.
          </p>
        </Card>

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          isLoading={submitting}
          disabled={submitting}
          className="rounded-sm !border-transparent bg-[#A8E368] font-black text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
        >
          <CheckCircle2 className="h-5 w-5" />
          Log payment
        </Button>

        <p className="text-center text-xs text-slate-500">
          Wrong reference?{' '}
          <Link href="/remittance" className="font-bold text-[#4E8F01]">
            View bank instructions again
          </Link>
        </p>
      </form>
    </main>
  );
}
