'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, ListChecks, Search } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

export default function ReconcilePage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [bankRef, setBankRef] = useState('');
  const [amount, setAmount] = useState('');
  const [match, setMatch] = useState<null | { agentCode: string; date: string; owedNgn: number }>(
    null,
  );
  const [done, setDone] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const all = adminMock.listRemittances();
    const candidate = all.find((r) => r.status === 'OVERDUE') ?? all[0];
    setMatch({
      agentCode: candidate.agentCode,
      date: candidate.date,
      owedNgn: candidate.owedNgn,
    });
  };

  const reconcile = () => {
    setDone(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="Remittance"
        title="Manual reconciliation"
        description="Paste a bank receipt and amount. We will search for the most likely agent remittance match."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Remittance', href: '/remittance' },
          { label: 'Reconcile' },
        ]}
      />

      <div className="mx-auto max-w-[860px] space-y-4 px-6 py-5">
        <SectionCard title="Lookup">
          <form onSubmit={search} className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Bank receipt reference
              </span>
              <input
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value.toUpperCase())}
                placeholder="GTB-TRF-XXXXXX"
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Amount (₦)
              </span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </label>
            <div className="flex items-end">
              <Button
                type="submit"
                variant="accent"
                className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </form>
        </SectionCard>

        {match && !done && (
          <SectionCard title="Probable match">
            <div className="rounded-xl border border-[#4E8F01]/15 bg-[#A8E368]/15 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                Suggested match
              </p>
              <p className="mt-1 font-display text-lg font-black text-[#0B1220]">
                {match.agentCode} · {match.date}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Owed {formatNaira(match.owedNgn)}. Reconciling will mark this remittance as
                PAID and record the receipt reference.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="accent"
                  onClick={reconcile}
                  className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
                >
                  <ListChecks className="h-4 w-4" />
                  Reconcile
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setMatch(null)}
                  className="rounded-md border-slate-200 bg-white"
                >
                  Search again
                </Button>
              </div>
            </div>
          </SectionCard>
        )}

        {done && (
          <SectionCard title="Reconciled">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <p className="text-sm">
                Receipt logged. Agent dashboard updates within 60 seconds.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </>
  );
}
