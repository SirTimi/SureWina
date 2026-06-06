'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Clock, ExternalLink } from 'lucide-react';
import type { AdminSession } from '@/lib/admin-auth';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationSeverityTone,
  notificationTypeLabel,
  type AdminNotification,
} from '@/lib/notifications-mock';
import { StatusPill } from '@/components/status-pill';

interface NotificationBellProps {
  session: AdminSession;
}

export function NotificationBell({ session }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const refresh = () => {
    setNotifications(listNotifications(session.role));
  };

  useEffect(() => {
    refresh();

    window.addEventListener('surewina:notifications-changed', refresh);
    return () => {
      window.removeEventListener('surewina:notifications-changed', refresh);
    };
  }, [session.role]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  const latest = notifications.slice(0, 6);

  const markAll = () => {
    markAllNotificationsRead(session.role);
    refresh();
  };

  const handleOpenNotification = (notification: AdminNotification) => {
    markNotificationRead(notification.notificationId);
    refresh();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        title="Notifications: pending approvals, escalations, failed processes, and overdue reviews"
        onClick={() => setOpen((value) => !value)}
        className="group relative flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-navy-700">
                Notifications
              </p>
              <p className="text-xs text-slate-500">
                {unreadCount.toLocaleString('en-NG')} unread alert
                {unreadCount === 1 ? '' : 's'}
              </p>
            </div>

            <button
              type="button"
              onClick={markAll}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {latest.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No notifications for your role.
              </div>
            ) : (
              latest.map((notification) => (
                <Link
                  key={notification.notificationId}
                  href={notification.targetHref ?? '/notifications'}
                  onClick={() => handleOpenNotification(notification)}
                  className={
                    notification.read
                      ? 'block border-b border-slate-100 px-4 py-3 hover:bg-slate-50'
                      : 'block border-b border-slate-100 bg-amber-50/60 px-4 py-3 hover:bg-amber-50'
                  }
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-sm font-black text-[#0B1220]">
                      {notification.title}
                    </p>
                    <StatusPill tone={notificationSeverityTone(notification.severity)}>
                      {notificationTypeLabel(notification.type)}
                    </StatusPill>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-600">
                    {notification.message}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(notification.createdAt).toLocaleString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    <span className="inline-flex items-center gap-1">
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-md bg-navy-800 px-3 py-2 text-center text-sm font-black text-white hover:bg-navy-900"
            >
              View notification table
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}