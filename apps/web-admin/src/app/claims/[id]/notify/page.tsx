'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { Mail, MessageSquare, Phone, Send, Smartphone } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { adminMock } from '@/lib/admin-mock';

type Channel = 'SMS' | 'PUSH' | 'EMAIL' | 'CALL';

export default function NotifyClaimPage({
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
  const router = useRouter();
  const claim = adminMock.getClaim(id);
  if (!claim) notFound();

  const [channel, setChannel] = useState<Channel>('SMS');
  const [message, setMessage] = useState(
    `Hi! This is Surewina — your ticket ${claim.ticketRef} won ${claim.prizeDescription}. Please open the app to claim within 14 days.`,
  );
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push(`/claims/${claim.claimId}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Notify winner"
        title={`Manual notification · ${claim.prizeDescription}`}
        description={`${claim.ticketRef} · ${claim.winnerPhoneE164}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Claims', href: '/claims' },
          { label: claim.claimId, href: `/claims/${claim.claimId}` },
          { label: 'Notify' },
        ]}
      />

      <div className="mx-auto max-w-[900px] space-y-4 px-6 py-5">
        <SectionCard
          title="Channel"
          description="SMS and call attempts increment the contact-attempts counter on the claim."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ChannelTile
              active={channel === 'SMS'}
              icon={<MessageSquare className="h-4 w-4" />}
              label="SMS"
              onClick={() => setChannel('SMS')}
            />
            <ChannelTile
              active={channel === 'PUSH'}
              icon={<Smartphone className="h-4 w-4" />}
              label="Push"
              onClick={() => setChannel('PUSH')}
            />
            <ChannelTile
              active={channel === 'EMAIL'}
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              onClick={() => setChannel('EMAIL')}
            />
            <ChannelTile
              active={channel === 'CALL'}
              icon={<Phone className="h-4 w-4" />}
              label="Call log"
              onClick={() => setChannel('CALL')}
            />
          </div>
        </SectionCard>

        <SectionCard title="Message">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/30"
          />
          <p className="mt-2 text-xs text-slate-500">
            {message.length} chars · {channel === 'SMS' ? `${Math.ceil(message.length / 160)} SMS segment(s)` : 'No segment limit'}
          </p>
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
            isLoading={sending}
            onClick={send}
            className="rounded-md !border-transparent bg-[#4E8F01] font-black text-white hover:!border-transparent hover:bg-[#3a6a01]"
          >
            <Send className="h-4 w-4" />
            Send via {channel}
          </Button>
        </div>
      </div>
    </>
  );
}

function ChannelTile({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center justify-center gap-2 rounded-md border-2 border-[#4E8F01] bg-[#A8E368]/15 p-3 text-sm font-black text-[#0B1220]'
          : 'flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 hover:border-[#4E8F01]/30'
      }
    >
      {icon}
      {label}
    </button>
  );
}
