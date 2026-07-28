'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertOctagon, Bell, CheckCircle2, ExternalLink } from 'lucide-react';
import type { AdminNotification } from '@surewina/api-client';
import type { AdminSession } from '@/lib/admin-auth';
import { api } from '@/lib/api';

const REFRESH_MS = 60_000;

interface NotificationBellProps {
  session: AdminSession;
}

export function NotificationBell({ session }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.admin
      .notifications()
      .then((res) => {
        setItems(res.notifications);
        setTotal(res.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  // These are live states, not stored events — so we re-derive periodically
  // rather than tracking read/unread. The count drops when the work is done.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [session.adminUserId]);

  const hasCritical = items.some((n) => n.severity === 'CRITICAL');

  return (
    <div className="relative">
      <button
        type="button"
        title="Work needing your attention"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />

        {total > 0 && (
          <span
            className={
              hasCritical
                ? 'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white'
                : 'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-white'
            }
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 z-50 mt-2 w-[380px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-navy-700">
                Needs attention
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {loading
                  ? 'Checking…'
                  : total === 0
                    ? 'Nothing outstanding'
                    : `${total} item${total === 1 ? '' : 's'} across ${items.length} queue${items.length === 1 ? '' : 's'}`}
              </p>
            </div>

            {items.length === 0 && !loading ? (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-bold text-[#0B1220]">You&apos;re clear</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  No queues are waiting on you right now.
                </p>
              </div>
            ) : (
              <div className="thin-scrollbar max-h-[380px] overflow-y-auto">
                {items.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={
                      n.severity === 'CRITICAL'
                        ? 'block border-b border-slate-100 bg-red-50 px-4 py-3 last:border-b-0 hover:bg-red-100'
                        : n.severity === 'WARNING'
                          ? 'block border-b border-slate-100 bg-amber-50 px-4 py-3 last:border-b-0 hover:bg-amber-100'
                          : 'block border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50'
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-black text-[#0B1220]">
                          {n.severity === 'CRITICAL' && (
                            <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-red-600" />
                          )}
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                          {n.detail}
                        </p>
                      </div>

                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#0B1220] px-1.5 text-[11px] font-black text-white">
                        {n.count}
                      </span>
                    </div>

                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-navy-700">
                      Open <ExternalLink className="h-3 w-3" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}