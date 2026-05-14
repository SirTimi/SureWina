'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Tag } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

type PromoType = 'PERCENTAGE_OFF' | 'FLAT_OFF' | 'BONUS_ENTRIES';

export default function NewPromoPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const router = useRouter();
  const [type, setType] = useState<PromoType>('PERCENTAGE_OFF');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [value, setValue] = useState('10');
  const [cap, setCap] = useState('1000');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 16);
  });

  return (
    <>
      <PageHeader
        eyebrow="Promotions"
        title="New campaign"
        description="Configure a discount or bonus entry promotion. Creates as DRAFT until you activate it."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Promotions', href: '/promotions' },
          { label: 'New' },
        ]}
      />

      <div className="mx-auto max-w-[900px] space-y-4 px-6 py-5">
        <SectionCard title="Type">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['PERCENTAGE_OFF', 'FLAT_OFF', 'BONUS_ENTRIES'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={
                  type === t
                    ? 'flex items-center justify-center gap-2 rounded-md border-2 border-[#4E8F01] bg-[#A8E368]/15 p-3 text-sm font-black text-[#0B1220]'
                    : 'flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 hover:border-[#4E8F01]/30'
                }
              >
                <Tag className="h-4 w-4" />
                {t.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Campaign name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Easter weekend boost"
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Promo code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="EASTER25"
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field
              label={
                type === 'PERCENTAGE_OFF'
                  ? 'Percent off'
                  : type === 'FLAT_OFF'
                    ? 'Flat ₦ off'
                    : 'Bonus entries multiplier'
              }
            >
              <input
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Redemption cap">
              <input
                inputMode="numeric"
                value={cap}
                onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Starts at">
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Ends at">
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => router.back()}
            className="rounded-md border-slate-200 bg-white"
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!name.trim() || !code.trim()}
            onClick={() => router.push('/promotions')}
            className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01] disabled:!bg-slate-200 disabled:text-slate-500"
          >
            Create as DRAFT
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
