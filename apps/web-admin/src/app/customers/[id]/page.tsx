'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { Flag, Pencil, Phone, ShieldCheck, Ticket, Trophy } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function CustomerDetailPage({
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
  const customer = adminMock.getCustomer(id);
  if (!customer) notFound();

  const tickets = adminMock
    .listTickets()
    .filter((t) => t.customerPhoneE164 === customer.phoneE164)
    .slice(0, 8);

  const claims = adminMock
    .listClaims()
    .filter((c) => c.winnerPhoneE164 === customer.phoneE164);

  const [notes, setNotes] = useState(customer.notes ?? '');

  return (
    <>
      <PageHeader
        eyebrow="Customer"
        title={customer.displayName ?? customer.phoneE164}
        description={`Customer since ${new Date(customer.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Customers', href: '/customers' },
          { label: customer.phoneE164 },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            {customer.flagged && (
              <StatusPill tone="warning" icon={<Flag className="h-3 w-3" />}>
                Flagged
              </StatusPill>
            )}
            <Button
              variant="secondary"
              className="rounded-md border-slate-200 bg-white text-[#0B1220]"
            >
              <Pencil className="h-4 w-4" />
              Edit notes
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Stat icon={Phone} label="Phone">{customer.phoneE164}</Stat>
          <Stat icon={ShieldCheck} label="KYC">
            <StatusPill tone={statusToTone(customer.kycStatus)}>
              {customer.kycStatus}
            </StatusPill>
          </Stat>
          <Stat icon={Ticket} label="Tickets">{customer.ticketCount}</Stat>
          <Stat icon={Trophy} label="Prizes won">
            {formatNaira(customer.lifetimePrizeNgn)}
          </Stat>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Recent tickets" padded={false}>
            <table className="min-w-full text-sm">
              <thead className="bg-[#F8FAF4] text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Ticket</th>
                  <th className="px-4 py-2 text-left">Draw</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No tickets on record.
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.ticketRef}>
                      <td className="px-4 py-2">
                        <Link
                          href={`/tickets/${t.ticketRef}`}
                          className="font-mono text-sm font-black text-[#0B1220] hover:text-[#4E8F01]"
                        >
                          {t.ticketRef}
                        </Link>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{t.drawCode}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatNaira(t.amountNgn)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusPill tone={statusToTone(t.status)}>{t.status}</StatusPill>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(t.createdAt).toLocaleDateString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard title="Claims" padded={false}>
            {claims.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No claims on file.</p>
            ) : (
              claims.map((c) => (
                <Link
                  key={c.claimId}
                  href={`/claims/${c.claimId}`}
                  className="block border-b border-slate-100 p-3 last:border-b-0 hover:bg-[#F8FAF4]"
                >
                  <p className="text-sm font-black text-[#0B1220]">{c.prizeDescription}</p>
                  <p className="font-mono text-xs text-slate-500">{c.ticketRef}</p>
                  <p className="mt-1">
                    <StatusPill tone={statusToTone(c.stage)}>{c.stage}</StatusPill>
                  </p>
                </Link>
              ))
            )}
          </SectionCard>
        </div>

        <SectionCard title="Internal notes" description="Not shown to the customer.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
          />
        </SectionCard>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-[#A8E368]/30 text-[#4E8F01]">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate font-display text-base font-black text-[#0B1220]">
        {children}
      </p>
    </div>
  );
}
