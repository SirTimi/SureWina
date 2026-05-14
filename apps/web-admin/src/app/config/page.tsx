'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, Save, Settings2 } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

export default function SystemConfigPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const [dailyPrice, setDailyPrice] = useState('500');
  const [jackpotPrice, setJackpotPrice] = useState('5000');
  const [dailyCutoff, setDailyCutoff] = useState('19:00');
  const [jackpotCutoff, setJackpotCutoff] = useState('19:00');
  const [remitDeadline, setRemitDeadline] = useState('23:00');
  const [graceMinutes, setGraceMinutes] = useState('60');
  const [whtRate, setWhtRate] = useState('0.05');
  const [stateLevy, setStateLevy] = useState('0.025');

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Configuration"
        description="Operational thresholds that wire into draws, agents, and finance. All edits are versioned + audited."
        breadcrumbs={[{ label: 'Admin', href: '/' }, { label: 'Config' }]}
        rightSlot={
          <Button
            variant="accent"
            className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
          >
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-5">
        <SectionCard title="Ticket pricing">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Daily standard ticket (₦)">
              <input
                inputMode="numeric"
                value={dailyPrice}
                onChange={(e) => setDailyPrice(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Saturday jackpot ticket (₦)">
              <input
                inputMode="numeric"
                value={jackpotPrice}
                onChange={(e) => setJackpotPrice(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Cutoffs & deadlines">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Daily draw sales cutoff (WAT)">
              <input
                type="time"
                value={dailyCutoff}
                onChange={(e) => setDailyCutoff(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Saturday jackpot cutoff (WAT)">
              <input
                type="time"
                value={jackpotCutoff}
                onChange={(e) => setJackpotCutoff(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Agent remittance deadline (WAT)">
              <input
                type="time"
                value={remitDeadline}
                onChange={(e) => setRemitDeadline(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="Remittance grace window (minutes)">
              <input
                inputMode="numeric"
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Tax & levies">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="WHT rate (decimal)">
              <input
                value={whtRate}
                onChange={(e) => setWhtRate(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
            <Field label="State Games Board levy (decimal)">
              <input
                value={stateLevy}
                onChange={(e) => setStateLevy(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Linked configuration"
          description="More granular settings live on dedicated pages."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href="/config/templates"
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-[#0B1220] hover:border-[#4E8F01]/30 hover:bg-[#F8FAF4]"
            >
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#4E8F01]" />
                Notification templates
              </span>
              <span className="text-xs text-[#4E8F01]">→</span>
            </Link>
            <Link
              href="/agents/super"
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-[#0B1220] hover:border-[#4E8F01]/30 hover:bg-[#F8FAF4]"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[#4E8F01]" />
                Commission tiers
              </span>
              <span className="text-xs text-[#4E8F01]">→</span>
            </Link>
          </div>
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
      {children}
    </label>
  );
}
