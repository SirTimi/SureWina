'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { BellRing, Clock, MessageCircle, Phone, Trophy } from 'lucide-react';
import { Button } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock } from '@/lib/admin-mock';

export default function ClaimDetailPage({
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
  const claim = adminMock.getClaim(id);
  if (!claim) notFound();

  const events = [
    { label: 'Winner notified', at: claim.notifiedAt },
    { label: 'Path selected', at: claim.selectedAt },
    { label: 'KYC completed', at: claim.kycCompletedAt },
    { label: 'Dispatched', at: claim.dispatchedAt },
    { label: 'Delivered', at: claim.deliveredAt },
  ].filter((e) => e.at);

  return (
    <>
      <PageHeader
        eyebrow="Claim"
        title={claim.prizeDescription}
        description={`${claim.ticketRef} · ${formatNaira(claim.prizeValueNgn)}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Claims', href: '/claims' },
          { label: claim.claimId },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(claim.stage)}>{claim.stage}</StatusPill>
            <Link href={`/claims/${claim.claimId}/notify`}>
              <Button
                variant="secondary"
                className="rounded-md border-slate-200 bg-white text-[#0B1220]"
              >
                <BellRing className="h-4 w-4" />
                Send notification
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Trophy} label="Prize">{claim.prizeDescription}</Stat>
          <Stat icon={Phone} label="Winner">{claim.winnerPhoneE164}</Stat>
          <Stat icon={Clock} label="Forfeits in">
            {Math.ceil(
              (new Date(claim.forfeitsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
            )}
            d
          </Stat>
          <Stat icon={MessageCircle} label="Contact attempts">
            {String(claim.contactAttempts)}
          </Stat>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Timeline">
            <ol className="space-y-3">
              {events.map((e, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-[#4E8F01]" />
                  <div>
                    <p className="text-sm font-bold text-[#0B1220]">{e.label}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(e.at!).toLocaleString('en-NG')}
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex items-start gap-3 opacity-60">
                <div className="mt-1.5 h-2 w-2 rounded-full border border-slate-300 bg-white" />
                <div>
                  <p className="text-sm font-bold text-[#0B1220]">Forfeit window</p>
                  <p className="text-xs text-slate-500">
                    {new Date(claim.forfeitsAt).toLocaleString('en-NG')}
                  </p>
                </div>
              </li>
            </ol>
          </SectionCard>

          <SectionCard title="Contact attempts log" padded={false}>
            <ul className="divide-y divide-slate-100">
              {Array.from({ length: claim.contactAttempts }).map((_, i) => (
                <li key={i} className="flex items-start justify-between gap-3 p-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#4E8F01]" />
                    <p className="text-sm">
                      {i === 0 ? 'SMS auto-sent' : `Call attempt ${i}`}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{i + 1}d ago</p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        {claim.notes && (
          <SectionCard title="Operator notes">
            <p className="text-sm leading-relaxed text-[#0B1220]">{claim.notes}</p>
          </SectionCard>
        )}
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
      <p className="mt-0.5 truncate text-sm font-bold text-[#0B1220]">{children}</p>
    </div>
  );
}
