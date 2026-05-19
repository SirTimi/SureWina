'use client';

import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { Check, MessageSquarePlus, Send, X } from 'lucide-react';
import { Button } from '@surewina/ui';
import { AdminShell } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill, statusToTone } from '@/components/status-pill';
import { adminMock, type Dispute } from '@/lib/admin-mock';

export default function DisputeDetailPage({
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
  const initial = adminMock.getDispute(id);
  if (!initial) notFound();

  const [dispute, setDispute] = useState<Dispute>(initial);
  const [reply, setReply] = useState('');

  const send = () => {
    if (!reply.trim()) return;
    setDispute((d) => ({
      ...d,
      thread: [
        ...d.thread,
        {
          actor: 'SUPPORT',
          by: 'you@surewina.ng',
          body: reply.trim(),
          at: new Date().toISOString(),
        },
      ],
      messageCount: d.messageCount + 1,
      lastUpdatedAt: new Date().toISOString(),
    }));
    setReply('');
  };

  const resolve = (status: 'RESOLVED' | 'REJECTED') =>
    setDispute((d) => ({ ...d, status }));

  return (
    <>
      <PageHeader
        eyebrow="Dispute"
        title={dispute.subject}
        description={`From ${dispute.customerPhoneE164} · opened ${new Date(dispute.createdAt).toLocaleDateString('en-NG')}`}
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Disputes', href: '/disputes' },
          { label: dispute.disputeId },
        ]}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusPill tone={statusToTone(dispute.status)}>{dispute.status}</StatusPill>
            <Button
              variant="secondary"
              onClick={() => resolve('REJECTED')}
              className="rounded-md border-red-200 bg-red-50 text-red-700"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="accent"
              onClick={() => resolve('RESOLVED')}
              className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900"
            >
              <Check className="h-4 w-4" />
              Mark resolved
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-5">
        <SectionCard title="Conversation" padded={false}>
          <ol className="divide-y divide-slate-100">
            {dispute.thread.map((m, i) => (
              <li
                key={i}
                className={
                  m.actor === 'SUPPORT'
                    ? 'bg-[#F8FAF4] p-4'
                    : 'p-4'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    {m.actor === 'SUPPORT' ? 'Support' : 'Customer'} · {m.by}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(m.at).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#0B1220]">{m.body}</p>
              </li>
            ))}
          </ol>

          <div className="border-t border-slate-100 p-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
              <MessageSquarePlus className="h-3 w-3" />
              Reply
            </p>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="Write a reply to the customer…"
              className="w-full rounded-md border border-slate-200 p-3 text-sm font-medium outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Customer receives an SMS notification and an in-app message.
              </p>
              <Button
                variant="accent"
                onClick={send}
                disabled={!reply.trim()}
                className="rounded-md !border-transparent bg-navy-800 font-black text-white hover:!border-transparent hover:bg-navy-900 disabled:!bg-slate-200 disabled:text-slate-500"
              >
                <Send className="h-4 w-4" />
                Send reply
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
