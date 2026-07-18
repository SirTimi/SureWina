'use client';

import Link from 'next/link';
import { CheckCheck, ExternalLink, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  listNotifications,
  markAllNotificationsRead,
  notificationSeverityTone,
  notificationTypeLabel,
  type AdminNotification,
  type NotificationChannel,
} from '@/lib/notifications-mock';
import { type AdminRole } from '@/lib/admin-auth';

export default function NotificationsPage() {
  return (
    <AdminShell>
      {(session) => <Body role={session.tier} />}
    </AdminShell>
  );
}

function Body({ role }: { role: AdminRole }) {
  const notifications = listNotifications(role);
  const unread = notifications.filter((notification) => !notification.read).length;

  const markAll = () => {
    markAllNotificationsRead(role!);
    window.location.reload();
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations · Notifications"
        title="Notification routing"
        description="In-app alerts for workflow approvals, escalations, overdue tasks, and failed workflows."
        breadcrumbs={[
          { label: 'Admin', href: '/' },
          { label: 'Notifications' },
        ]}
        rightSlot={
          <button
            type="button"
            onClick={markAll}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#0B1220] hover:bg-slate-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        }
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard label="Total alerts" value={notifications.length.toLocaleString('en-NG')} />
          <SummaryCard label="Unread" value={unread.toLocaleString('en-NG')} tone="warning" />
          <SummaryCard
            label="Escalations"
            value={notifications.filter((n) => n.type === 'ESCALATION').length.toLocaleString('en-NG')}
            tone="danger"
          />
          <SummaryCard
            label="Pending approvals"
            value={notifications.filter((n) => n.type === 'PENDING_APPROVAL').length.toLocaleString('en-NG')}
            tone="info"
          />
        </div>

        <SectionCard
          title="Channel rollout"
          description="Start with in-app notifications. Email comes second. SMS and WhatsApp come later."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ChannelCard label="In-app" status="Active now" active />
            <ChannelCard label="Email" status="Next phase" icon={<Mail className="h-5 w-5" />} />
            <ChannelCard label="SMS" status="Later" icon={<Smartphone className="h-5 w-5" />} />
            <ChannelCard label="WhatsApp" status="Later" icon={<MessageCircle className="h-5 w-5" />} />
          </div>
        </SectionCard>

        <DataTable<AdminNotification>
          rows={notifications}
          rowKey={(notification) => notification.notificationId}
          searchPlaceholder="Search notification title, message, type…"
          searchFn={(notification, query) =>
            notification.title.toLowerCase().includes(query) ||
            notification.message.toLowerCase().includes(query) ||
            notificationTypeLabel(notification.type).toLowerCase().includes(query)
          }
          emptyMessage="No notifications for your role."
          columns={[
            {
              key: 'status',
              header: 'Status',
              render: (notification) => (
                <div className="space-y-1">
                  <StatusPill tone={notificationSeverityTone(notification.severity)}>
                    {notificationTypeLabel(notification.type)}
                  </StatusPill>
                  <p className={notification.read ? 'text-xs text-slate-400' : 'text-xs font-black text-amber-700'}>
                    {notification.read ? 'Read' : 'Unread'}
                  </p>
                </div>
              ),
            },
            {
              key: 'message',
              header: 'Alert',
              render: (notification) => (
                <div>
                  <p className="font-bold text-[#0B1220]">{notification.title}</p>
                  <p className="max-w-[520px] text-xs leading-relaxed text-slate-500">
                    {notification.message}
                  </p>
                </div>
              ),
            },
            {
              key: 'channels',
              header: 'Channels',
              render: (notification) => (
                <div className="flex flex-wrap gap-1">
                  {notification.channels.map((channel) => (
                    <span
                      key={channel}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"
                    >
                      {channelLabel(channel)}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: 'created',
              header: 'Created',
              render: (notification) => (
                <span className="text-xs text-slate-500">
                  {new Date(notification.createdAt).toLocaleString('en-NG', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (notification) =>
                notification.targetHref ? (
                  <Link
                    href={notification.targetHref}
                    className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-navy-700 hover:underline"
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'info';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50 text-red-800'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-white text-[#0B1220]';

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em]">
        {value}
      </p>
    </div>
  );
}

function ChannelCard({
  label,
  status,
  icon,
  active = false,
}: {
  label: string;
  status: string;
  icon?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={
        active
          ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800'
          : 'rounded-2xl border border-slate-200 bg-white p-4 text-slate-600'
      }
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white/70">
        {icon ?? <CheckCheck className="h-5 w-5" />}
      </div>
      <p className="font-bold">{label}</p>
      <p className="mt-1 text-xs font-semibold opacity-70">{status}</p>
    </div>
  );
}

function channelLabel(channel: NotificationChannel) {
  if (channel === 'IN_APP') return 'In-app';
  if (channel === 'EMAIL') return 'Email';
  if (channel === 'SMS') return 'SMS';
  return 'WhatsApp';
}