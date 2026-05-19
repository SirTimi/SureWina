'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  History,
} from 'lucide-react';
import { Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock } from '@/lib/agent-mock';

type Status = Awaited<ReturnType<typeof agentMock.getRemittanceStatus>>;

export default function RemittancePage() {
  return (
    <AgentShell>
      {(agent) => <RemittanceBody agentOverdue={agent.remittanceOverdue} />}
    </AgentShell>
  );
}

function RemittanceBody({ agentOverdue }: { agentOverdue: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    agentMock.getRemittanceStatus().then(setStatus);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!status) {
    return (
      <main className="mx-auto max-w-[760px] px-4 pb-10 pt-5">
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </main>
    );
  }

  const overdue = agentOverdue || status.overdue;
  const ms = new Date(status.deadlineAt).getTime() - now;
  const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
  const minutes = Math.max(0, Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000)));

  const tone = overdue
    ? 'bg-red-50 border-red-200 text-red-700'
    : hours < 2
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-amber-50 border-navy-200 text-navy-700';

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Remittance"
        title="Settle today's remittance"
        description="You hold customer money until you remit it. The deadline is 23:00 WAT daily."
        backHref="/"
        rightSlot={
          <Link href="/remittance/history">
            <Button
              variant="secondary"
              className="rounded-sm border-navy-200 bg-white text-navy-700"
            >
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
        }
      />

      <Card
        className={`rounded-3xl border p-5 shadow-sm ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Owed right now
            </p>
            <p className="mt-2 font-display text-5xl font-black tracking-[-0.04em] text-navy-950 tabular-nums">
              {formatNaira(status.owedNgn)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              From {formatNaira(status.salesTodayNgn)} sold today, after your 10%
              commission.
            </p>
          </div>

          <div
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 lg:w-auto ${tone}`}
          >
            {overdue ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Clock className="h-5 w-5" />
            )}
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.14em]">
                {overdue ? 'Overdue' : 'Time left'}
              </p>
              <p className="font-mono text-lg font-black tabular-nums">
                {overdue ? '—' : `${hours}h ${minutes}m`}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href="/remittance/pay" className="flex-1">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              className="rounded-sm !border-transparent bg-amber-500 font-black text-navy-950 hover:!border-transparent hover:bg-amber-400"
            >
              <Banknote className="h-5 w-5" />
              Pay {formatNaira(status.owedNgn)}
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/remittance/history" className="sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="rounded-sm border-navy-200 bg-white text-navy-700"
            >
              See past remittances
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="mt-4 rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
              Bank transfer instructions
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Transfer the exact amount and include the reference below so the system
              auto-reconciles your remittance.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <InstructionRow
            label="Bank"
            value={status.bankInstructions.bankName}
            onCopy={() => copy('bank', status.bankInstructions.bankName)}
            copied={copied === 'bank'}
          />
          <InstructionRow
            label="Account number"
            value={status.bankInstructions.accountNumber}
            onCopy={() => copy('account', status.bankInstructions.accountNumber)}
            copied={copied === 'account'}
            mono
          />
          <InstructionRow
            label="Account name"
            value={status.bankInstructions.accountName}
            onCopy={() => copy('name', status.bankInstructions.accountName)}
            copied={copied === 'name'}
          />
          <InstructionRow
            label="Reference"
            value={status.bankInstructions.reference}
            onCopy={() => copy('ref', status.bankInstructions.reference)}
            copied={copied === 'ref'}
            mono
            emphasis
          />
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-navy-100 bg-[#F8FAF4] p-3 text-sm text-slate-600">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
          <p>
            After the transfer, tap{' '}
            <Link href="/remittance/pay" className="font-bold text-navy-700">
              Pay {formatNaira(status.owedNgn)}
            </Link>{' '}
            to log your bank receipt so finance can verify.
          </p>
        </div>
      </Card>
    </main>
  );
}

function InstructionRow({
  label,
  value,
  onCopy,
  copied,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex items-center justify-between gap-3 rounded-2xl border-2 border-navy-200 bg-amber-50 px-4 py-3'
          : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#F8FAF4] px-4 py-3'
      }
    >
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        <p
          className={
            mono
              ? 'mt-1 truncate font-mono text-base font-black text-navy-950'
              : 'mt-1 truncate text-base font-bold text-navy-950'
          }
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy-700"
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
