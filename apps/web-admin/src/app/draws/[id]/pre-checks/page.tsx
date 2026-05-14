'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { AlertTriangle, CheckCircle2, Play, RotateCw, XCircle } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

type Check = {
  id: string;
  label: string;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'WARN';
};

const SEED_CHECKS: Check[] = [
  {
    id: 'rng',
    label: 'RNG seed committed',
    description: 'Pre-draw seed hash exists and was committed > 15 min before draw.',
    status: 'PENDING',
  },
  {
    id: 'cap',
    label: 'Ticket cap configured',
    description: 'Ticket cap is set and > 0.',
    status: 'PENDING',
  },
  {
    id: 'cutoff',
    label: 'Cutoff in the past',
    description: 'Sales cutoff has elapsed before draw execution time.',
    status: 'PENDING',
  },
  {
    id: 'fund',
    label: 'Prize liquidity available',
    description: 'Prize fund balance covers full prize value.',
    status: 'PENDING',
  },
  {
    id: 'auditor',
    label: 'Auditor chain healthy',
    description: 'Last 10 minutes of signed ticket counters are sequential.',
    status: 'PENDING',
  },
  {
    id: 'notify',
    label: 'Notification templates approved',
    description: 'SMS, push, and email templates are live for this draw type.',
    status: 'PENDING',
  },
];

export default function PreChecksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const draw = adminMock.getDraw(id);
  if (!draw) notFound();

  const [checks, setChecks] = useState<Check[]>(SEED_CHECKS);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setChecks((c) => c.map((x) => ({ ...x, status: 'PENDING' })));
    for (let i = 0; i < SEED_CHECKS.length; i++) {
      setChecks((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, status: 'RUNNING' } : c)),
      );
      await new Promise((r) => setTimeout(r, 250));
      const verdict: Check['status'] =
        i === 4 ? 'WARN' : i === 1 && Math.random() > 0.7 ? 'FAILED' : 'PASSED';
      setChecks((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, status: verdict } : c)),
      );
    }
    setRunning(false);
  };

  const allPassed = checks.every((c) => c.status === 'PASSED' || c.status === 'WARN');

  return (
    <>
      <PageHeader
        eyebrow="Pre-draw checks"
        title={`Pre-checks · ${draw.prizeDescription}`}
        description="Every check must pass before the draw can move from SCHEDULED to OPEN execution."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: draw.drawCode, href: `/draws/${draw.drawCode}` },
          { label: 'Pre-checks' },
        ]}
        rightSlot={
          <Button
            variant="accent"
            onClick={run}
            isLoading={running}
            className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
          >
            {running ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run all checks
          </Button>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-3 px-6 py-5">
        {checks.map((c) => (
          <SectionCard key={c.id} padded={false}>
            <div className="flex items-start gap-4 p-4">
              <div
                className={
                  c.status === 'PASSED'
                    ? 'flex h-9 w-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-700'
                    : c.status === 'FAILED'
                      ? 'flex h-9 w-9 items-center justify-center rounded-md bg-red-100 text-red-700'
                      : c.status === 'WARN'
                        ? 'flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-700'
                        : c.status === 'RUNNING'
                          ? 'flex h-9 w-9 items-center justify-center rounded-md bg-sky-100 text-sky-700'
                          : 'flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-400'
                }
              >
                {c.status === 'PASSED' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : c.status === 'FAILED' ? (
                  <XCircle className="h-4 w-4" />
                ) : c.status === 'WARN' ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : c.status === 'RUNNING' ? (
                  <RotateCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#0B1220]">{c.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
              </div>
              <span
                className={
                  c.status === 'PASSED'
                    ? 'rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700'
                    : c.status === 'FAILED'
                      ? 'rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-red-700'
                      : c.status === 'WARN'
                        ? 'rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700'
                        : c.status === 'RUNNING'
                          ? 'rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700'
                          : 'rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500'
                }
              >
                {c.status}
              </span>
            </div>
          </SectionCard>
        ))}

        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {allPassed ? (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              All checks passed. You can promote this draw to OPEN.
            </p>
          ) : checks.some((c) => c.status === 'FAILED') ? (
            <p className="flex items-center gap-2 text-red-700">
              <XCircle className="h-4 w-4" />
              At least one check failed. Resolve it before opening this draw.
            </p>
          ) : (
            <p className="text-slate-500">
              Run all checks above to verify draw readiness.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
