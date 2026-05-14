'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { Banknote, Phone, ShieldCheck, Ticket, Trophy } from 'lucide-react';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = use(params);
  return (
    <AdminShell>
      {() => <Body ref_={ref} />}
    </AdminShell>
  );
}

function Body({ ref_ }: { ref_: string }) {
  const t = adminMock.getTicket(ref_);
  if (!t) notFound();

  const trail = [
    { at: t.createdAt, label: 'Ticket issued', icon: Ticket },
    { at: t.createdAt, label: `Payment ${t.paymentStatus.toLowerCase()}`, icon: Banknote },
    ...(t.status === 'WINNING'
      ? [{ at: t.createdAt, label: 'Marked as winner', icon: Trophy }]
      : []),
    {
      at: new Date(Date.now() - 60_000).toISOString(),
      label: 'Last queried by support',
      icon: ShieldCheck,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ticket"
        title={t.ticketRef}
        description={`Draw ${t.drawCode} · ${t.channel}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Tickets', href: '/tickets' },
          { label: t.ticketRef },
        ]}
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SectionCard title="Configuration">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status">
                <StatusPill tone={statusToTone(t.status)}>{t.status}</StatusPill>
              </Field>
              <Field label="Payment">
                <StatusPill tone={statusToTone(t.paymentStatus)}>
                  {t.paymentStatus}
                </StatusPill>
              </Field>
              <Field label="Channel">{t.channel}</Field>
              <Field label="Amount">{formatNaira(t.amountNgn)}</Field>
              <Field label="Customer">
                <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                  <Phone className="h-3 w-3" />
                  {t.customerPhoneE164}
                </span>
              </Field>
              <Field label="Agent">
                {t.agentCode ? (
                  <Link
                    href={`/agents/${t.agentCode}`}
                    className="font-mono text-sm font-bold text-[#4E8F01] hover:underline"
                  >
                    {t.agentCode}
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500">Direct customer purchase</span>
                )}
              </Field>
              <Field label="Draw">
                <Link
                  href={`/draws/${t.drawCode}`}
                  className="font-mono text-sm font-bold text-[#4E8F01] hover:underline"
                >
                  {t.drawCode}
                </Link>
              </Field>
              <Field label="Created">{new Date(t.createdAt).toLocaleString('en-NG')}</Field>
            </dl>
          </SectionCard>

          <SectionCard title="Audit trail" padded={false}>
            <ol className="divide-y divide-slate-100">
              {trail.map((e, i) => {
                const Icon = e.icon;
                return (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#A8E368]/30 text-[#4E8F01]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0B1220]">{e.label}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(e.at).toLocaleString('en-NG')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold text-[#0B1220]">{children}</dd>
    </div>
  );
}
