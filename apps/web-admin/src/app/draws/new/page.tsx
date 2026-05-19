'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Calendar, Image as ImageIcon, Trophy } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';

export default function NewDrawPage() {
  return (
    <AdminShell>
      {() => <Body />}
    </AdminShell>
  );
}

function Body() {
  const router = useRouter();
  const [drawType, setDrawType] = useState<'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'SPECIAL'>(
    'DAILY_STANDARD',
  );
  const [prize, setPrize] = useState('');
  const [prizeValue, setPrizeValue] = useState('420000');
  const [ticketPrice, setTicketPrice] = useState('500');
  const [ticketCap, setTicketCap] = useState('10000');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt());
  const [cutoffAt, setCutoffAt] = useState(defaultCutoffAt());
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Mock — pretend backend created it and bounce back to the list.
    await new Promise((r) => setTimeout(r, 400));
    router.push('/draws');
  };

  return (
    <>
      <PageHeader
        eyebrow="Draws"
        title="Create a new draw"
        description="Configure prize, schedule, and ticket cap. Pre-checks must pass before the draw opens."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Draws', href: '/draws' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={submit} className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <SectionCard title="Draw type">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['DAILY_STANDARD', 'SATURDAY_JACKPOT', 'SPECIAL'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setDrawType(type);
                  if (type === 'SATURDAY_JACKPOT') {
                    setTicketPrice('5000');
                    setTicketCap('20000');
                  } else {
                    setTicketPrice('500');
                    setTicketCap('10000');
                  }
                }}
                className={
                  drawType === type
                    ? 'rounded-lg border-2 border-navy-700 bg-amber-50 p-3 text-left'
                    : 'rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-navy-200'
                }
              >
                <p className="text-sm font-black text-[#1A1816]">
                  {type.replace('_', ' ')}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {type === 'DAILY_STANDARD'
                    ? '₦500 ticket · product prize · daily cadence'
                    : type === 'SATURDAY_JACKPOT'
                      ? '₦5,000 ticket · ₦4M cash prize · Saturdays'
                      : 'One-off promotional or campaign draws'}
                </p>
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title="Prize">
            <FormRow label="Prize description">
              <input
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="Samsung Galaxy A55 5G"
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
            <FormRow label="Prize value (₦)">
              <input
                inputMode="numeric"
                value={prizeValue}
                onChange={(e) => setPrizeValue(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
            <FormRow label="Prize image">
              <div className="flex h-32 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-slate-200 bg-[#F8FAF4] text-slate-500 hover:border-navy-200">
                <div className="text-center">
                  <ImageIcon className="mx-auto h-6 w-6" />
                  <p className="mt-2 text-xs">
                    Click or drop a JPG/PNG · max 2 MB
                  </p>
                </div>
              </div>
            </FormRow>
          </SectionCard>

          <SectionCard title="Capacity & pricing">
            <FormRow label="Ticket price (₦)">
              <input
                inputMode="numeric"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
            <FormRow label="Ticket cap">
              <input
                inputMode="numeric"
                value={ticketCap}
                onChange={(e) => setTicketCap(e.target.value.replace(/\D/g, ''))}
                className="h-11 w-full rounded-md border border-slate-200 px-3 font-mono text-sm font-bold outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
            <FormRow label="Cutoff">
              <input
                type="datetime-local"
                value={cutoffAt}
                onChange={(e) => setCutoffAt(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
            <FormRow label="Scheduled execution">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
              />
            </FormRow>
          </SectionCard>
        </div>

        <SectionCard title="Visual calendar preview">
          <CalendarPreview scheduledAt={scheduledAt} />
        </SectionCard>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Trophy className="h-4 w-4 text-navy-700" />
            Draws are created as <span className="font-bold text-[#1A1816]">DRAFT</span>{' '}
            until pre-checks pass.
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="rounded-md border-slate-200 bg-white"
              type="button"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              isLoading={submitting}
              className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
            >
              Create draft draw
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function defaultScheduledAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}
function defaultCutoffAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function CalendarPreview({ scheduledAt }: { scheduledAt: string }) {
  const date = new Date(scheduledAt);
  const month = date.toLocaleString('en-NG', { month: 'long', year: 'numeric' });
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: startWeekday }).map(() => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-[#F8FAF4] p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1A1816]">
        <Calendar className="h-4 w-4 text-navy-700" />
        {month}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const isSelected = day === date.getDate();
          return (
            <div
              key={i}
              className={
                day === null
                  ? 'h-9 rounded-md'
                  : isSelected
                    ? 'flex h-9 items-center justify-center rounded-md bg-navy-800 text-xs font-black text-white'
                    : 'flex h-9 items-center justify-center rounded-md bg-white text-xs font-medium text-slate-600'
              }
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
