'use client';

import { useState } from 'react';
import { CheckCircle2, PlayCircle, RotateCw, ShieldCheck } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function CommissionRunPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const accrued = adminMock.listCommissionLedger().filter((r) => r.status === 'ACCRUED');
  const total = accrued.reduce((s, r) => s + r.commissionNgn + r.overrideNgn, 0);

  const [stage, setStage] = useState<'IDLE' | 'CONFIRMING' | 'RUNNING' | 'DONE'>('IDLE');
  const [progress, setProgress] = useState(0);

  const run = async () => {
    setStage('RUNNING');
    for (let i = 1; i <= accrued.length; i++) {
      await new Promise((r) => setTimeout(r, 60));
      setProgress(i);
    }
    setStage('DONE');
  };

  return (
    <>
      <PageHeader
        eyebrow="Commission · Disbursement"
        title="Run daily disbursement"
        description="Releases all accrued commission to agent bank accounts. Action is logged + audited."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Commission', href: '/commission' },
          { label: 'Run' },
        ]}
      />

      <div className="mx-auto max-w-[760px] space-y-4 px-6 py-5">
        <SectionCard>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#A8E368]/30 text-[#4E8F01]">
              <PlayCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-2xl font-black text-[#0B1220] tabular-nums">
                {formatNaira(total)}
              </p>
              <p className="text-sm text-slate-500">
                across {accrued.length} ledger entries · {new Set(accrued.map((a) => a.agentCode)).size} agents
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Pre-flight"
          description="The disbursement halts immediately if any of these fail."
        >
          <ul className="space-y-2">
            <Check label="Treasury balance available" status="OK" />
            <Check label="All agent bank accounts verified" status="OK" />
            <Check label="No active disputes pending hold" status="OK" />
            <Check label="MFA challenge passed within 5 minutes" status="OK" />
          </ul>
        </SectionCard>

        {stage === 'IDLE' && (
          <div className="flex items-center justify-end">
            <Button
              variant="accent"
              onClick={() => setStage('CONFIRMING')}
              className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
            >
              <PlayCircle className="h-4 w-4" />
              Start disbursement
            </Button>
          </div>
        )}

        {stage === 'CONFIRMING' && (
          <SectionCard>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-black text-[#0B1220]">Final confirmation</p>
                <p className="text-xs text-slate-500">
                  This action transfers {formatNaira(total)} to {new Set(accrued.map((a) => a.agentCode)).size} agents and cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setStage('IDLE')}
                className="rounded-md border-slate-200 bg-white"
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={run}
                className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
              >
                <PlayCircle className="h-4 w-4" />
                Confirm and run
              </Button>
            </div>
          </SectionCard>
        )}

        {stage === 'RUNNING' && (
          <SectionCard title="Running…">
            <div className="flex items-center gap-3">
              <RotateCw className="h-5 w-5 animate-spin text-[#4E8F01]" />
              <p className="text-sm font-bold text-[#0B1220]">
                Processing {progress} of {accrued.length} entries
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#4E8F01] transition-all"
                style={{ width: `${(progress / accrued.length) * 100}%` }}
              />
            </div>
          </SectionCard>
        )}

        {stage === 'DONE' && (
          <SectionCard>
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <div>
                <p className="text-sm font-black">Disbursement complete</p>
                <p className="text-xs">
                  {formatNaira(total)} released. Agents will see funds within 30 minutes.
                </p>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </>
  );
}

function Check({ label, status }: { label: string; status: 'OK' | 'FAIL' }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-[#F8FAF4] px-3 py-2 text-sm">
      <span className="text-[#0B1220]">{label}</span>
      <span
        className={
          status === 'OK'
            ? 'inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-700'
            : 'inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-red-700'
        }
      >
        <CheckCircle2 className="h-3 w-3" />
        {status}
      </span>
    </li>
  );
}
