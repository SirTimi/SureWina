'use client';

import { useState } from 'react';
import { Plus, Repeat, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';

interface RecurringTemplate {
  id: string;
  name: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  cadence: string;
  ticketPriceNgn: number;
  ticketCap: number;
  prizeRotation: string[];
  enabled: boolean;
}

const SEEDS: RecurringTemplate[] = [
  {
    id: 'tpl_daily',
    name: 'Daily standard',
    drawType: 'DAILY_STANDARD',
    cadence: 'Every day · cutoff 19:00 · execute 20:00',
    ticketPriceNgn: 500,
    ticketCap: 10_000,
    prizeRotation: ['Samsung A55', 'Hisense 55" TV', 'iPhone 15', 'LG OLED 65"'],
    enabled: true,
  },
  {
    id: 'tpl_saturday',
    name: 'Saturday jackpot',
    drawType: 'SATURDAY_JACKPOT',
    cadence: 'Saturdays · cutoff 19:00 · execute 20:00',
    ticketPriceNgn: 5000,
    ticketCap: 20_000,
    prizeRotation: ['Saturday ₦4M jackpot'],
    enabled: true,
  },
];

export default function RecurringTemplatesPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [templates, setTemplates] = useState(SEEDS);

  const toggle = (id: string) =>
    setTemplates((arr) =>
      arr.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    );

  return (
    <>
      <PageHeader
        eyebrow="Draws · Recurring templates"
        title="Auto-create rules"
        description="Templates create draws on a schedule. The operator only intervenes when a prize rotation changes."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: 'Recurring templates' },
        ]}
        rightSlot={
          <Button
            variant="accent"
            className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
          >
            <Plus className="h-4 w-4" />
            New template
          </Button>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-3 px-6 py-5">
        {templates.map((t) => (
          <SectionCard key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy-50 text-navy-700">
                  <Repeat className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-black text-[#0B1220]">{t.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{t.cadence}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill tone={t.enabled ? 'success' : 'neutral'}>
                  {t.enabled ? 'Enabled' : 'Paused'}
                </StatusPill>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0B1220] hover:bg-slate-50"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {t.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Ticket price">{formatNaira(t.ticketPriceNgn)}</Stat>
              <Stat label="Ticket cap">{t.ticketCap.toLocaleString('en-NG')}</Stat>
              <Stat label="Draw type">{t.drawType.replace('_', ' ')}</Stat>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Prize rotation
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.prizeRotation.map((p, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-slate-200 bg-[#F8FAF4] px-2.5 py-1 text-xs font-bold text-[#0B1220]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-[#F8FAF4] px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-[#0B1220]">{children}</p>
    </div>
  );
}
