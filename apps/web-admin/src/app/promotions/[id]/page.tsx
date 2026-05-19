'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { Pause, Play, Save } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function PromoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminShell>
      {() => <Body id={id} />}
    </AdminShell>
  );
}

function Body({ id }: { id: string }) {
  const promo = adminMock.getPromo(id);
  if (!promo) notFound();

  const [name, setName] = useState(promo.name);
  const [code, setCode] = useState(promo.code);
  const [value, setValue] = useState(String(promo.value));
  const [cap, setCap] = useState(String(promo.cap));

  const pct = Math.min(100, (promo.redemptions / promo.cap) * 100);

  return (
    <>
      <PageHeader
        eyebrow="Promotion"
        title={promo.name}
        description={`Code · ${promo.code}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Promotions', href: '/promotions' },
          { label: promo.campaignId },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(promo.status)}>{promo.status}</StatusPill>
            <Button
              variant="secondary"
              className="rounded-md border-slate-200 bg-white text-[#1A1816]"
            >
              {promo.status === 'ACTIVE' ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Activate
                </>
              )}
            </Button>
            <Button
              variant="accent"
              className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1000px] space-y-4 px-6 py-5">
        <SectionCard title="Configuration">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Campaign name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </Field>
            <Field label="Code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </Field>
            <Field label="Type">{promo.type.replace(/_/g, ' ')}</Field>
            <Field label="Value">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </Field>
            <Field label="Cap (max redemptions)">
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </Field>
            <Field label="Window">
              {new Date(promo.startsAt).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'short',
              })}{' '}
              →{' '}
              {new Date(promo.endsAt).toLocaleDateString('en-NG', {
                day: '2-digit',
                month: 'short',
              })}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Redemptions">
          <p className="font-display text-3xl font-black tabular-nums">
            {promo.redemptions.toLocaleString('en-NG')}{' '}
            <span className="text-sm text-slate-400">
              / {promo.cap.toLocaleString('en-NG')}
            </span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-navy-800"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">{pct.toFixed(1)}% of cap consumed.</p>
        </SectionCard>
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
      <span className="text-sm font-bold text-[#1A1816]">{children}</span>
    </label>
  );
}
