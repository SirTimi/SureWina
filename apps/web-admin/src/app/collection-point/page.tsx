'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, BadgeCheck, HandCoins, RotateCcw, ScanLine } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

interface Verified {
  claimId: string;
  winnerTicketRef: string;
  winnerPhone: string;
  claimType: 'PRODUCT' | 'CASH';
  prizeDescription: string;
  drawCode: string;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  collectionPoint: string | null;
  claimDeadlineAt: string;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function CollectionPointPage() {
  return <AdminShell>{(session) => <Body session={session} />}</AdminShell>;
}

function Body({ session }: { session: AdminSession }) {
  const [ticketRef, setTicketRef] = useState('');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<Verified | null>(null);
  const [handedOver, setHandedOver] = useState<{ ref: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTicketRef('');
    setCode('');
    setVerified(null);
    setHandedOver(null);
    setError(null);
  };

  const verify = async () => {
    if (ticketRef.trim().length < 6 || code.trim().length !== 6) {
      setError('Enter the full ticket number and the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.verifyRedemption(ticketRef.trim().toUpperCase(), code.trim());
      setVerified(res);
    } catch (e) {
      setVerified(null);
      setError(e instanceof Error ? e.message : 'Could not verify this code.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!verified) return;
    // Deliberate second step. The counter is handing over money or goods, so
    // this must be a decision, not a continuation of the verify tap.
    if (
      !window.confirm(
        `Hand over ${verified.claimType === 'CASH' ? naira(verified.netPrizeValueNgn) : verified.prizeDescription} to the holder of ${verified.winnerTicketRef}?\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.confirmRedemption(
        verified.winnerTicketRef,
        code.trim(),
      );
      setHandedOver({ ref: res.winnerTicketRef, amount: res.netPrizeValueNgn });
      setVerified(null);
      setTicketRef('');
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the handover.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Collection point"
        title="Verify and hand over"
        description="Check the customer's code and ticket before releasing any prize."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Collection point' }]}
      />

      <div className="mx-auto max-w-[720px] space-y-4 px-6 py-5">
        {handedOver && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
              <div>
                <p className="font-display text-xl font-black text-navy-950">Handed over.</p>
                <p className="mt-1 text-sm text-emerald-900">
                  {handedOver.ref} · {naira(handedOver.amount)} released and recorded against
                  your counter.
                </p>
              </div>
            </div>
          </div>
        )}

        <SectionCard
          title="Customer details"
          description="Ask for the ticket and the code sent to their phone."
        >
          <div className="space-y-3">
            <Field label="Ticket number">
              <input
                value={ticketRef}
                onChange={(e) => setTicketRef(e.target.value.toUpperCase())}
                placeholder="SW-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={!!verified}
                className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-lg font-black tracking-[0.1em] text-navy-950 outline-none focus:border-navy-700 disabled:bg-slate-50"
              />
            </Field>

            <Field label="Collection code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="off"
                disabled={!!verified}
                className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 font-mono text-2xl font-black tracking-[0.35em] text-navy-950 outline-none focus:border-navy-700 disabled:bg-slate-50"
              />
            </Field>

            {!verified && (
              <button
                type="button"
                onClick={verify}
                disabled={busy}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-navy-800 text-base font-black text-white disabled:opacity-50"
              >
                <ScanLine className="h-5 w-5" />
                {busy ? 'Checking…' : 'Verify'}
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </SectionCard>

        {verified && (
          <SectionCard
            title="Confirm before handing over"
            description="Check the phone number against what the customer tells you."
          >
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
                Code verified
              </p>
              <p className="mt-2 font-display text-3xl font-black text-navy-950">
                {verified.claimType === 'CASH'
                  ? naira(verified.netPrizeValueNgn)
                  : verified.prizeDescription}
              </p>
              {verified.claimType === 'CASH' && verified.whtAmountNgn > 0 && (
                <p className="mt-1 text-sm text-emerald-900">
                  {naira(verified.grossPrizeValueNgn)} prize less {naira(verified.whtAmountNgn)}{' '}
                  withholding tax. Hand over the amount above.
                </p>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Detail label="Ticket" value={verified.winnerTicketRef} mono />
              <Detail label="Winner phone" value={verified.winnerPhone} mono />
              <Detail label="Draw" value={verified.drawCode} mono />
              <Detail label="Prize type" value={verified.claimType === 'CASH' ? 'Cash' : 'Product'} />
            </dl>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-base font-black text-navy-950 disabled:opacity-50"
              >
                <HandCoins className="h-5 w-5" />
                {busy ? 'Recording…' : 'Confirm handover'}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-navy-700 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </SectionCard>
        )}

        <p className="text-center text-xs text-slate-500">
          Signed in as {session.fullName}. Every handover is recorded against your account.
        </p>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#F8FAF4] px-4 py-3">
      <dt className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</dt>
      <dd className={mono ? 'mt-1 font-mono text-sm font-black text-navy-950' : 'mt-1 text-sm font-bold text-navy-950'}>
        {value}
      </dd>
    </div>
  );
}