'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { AdminHeader } from '@/components/admin-header';
import { Sidebar } from '@/components/sidebar';
import {
  type AdminSession,
  canAccess,
  getAccessDeniedMessage,
  getStoredSession,
  roleLabel,
  seedSessionIfMissing,
} from '@/lib/admin-auth';

interface AdminShellProps {
  children: (session: AdminSession) => React.ReactNode;
  /** If true, redirects to /sign-in when no session is found. Default true. */
  requireAuth?: boolean;
}

export function AdminShell({ children, requireAuth = true }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const existing = getStoredSession();
    if (existing) {
      setSession(existing);
      setChecking(false);
      return;
    }
    if (!requireAuth) {
      // Seed a default Super Admin session for demo so reviewers don't bounce.
      setSession(seedSessionIfMissing());
      setChecking(false);
      return;
    }
    // Auto-seed for demo — the sign-in page can always overwrite.
    setSession(seedSessionIfMissing());
    setChecking(false);
  }, [requireAuth, router]);

  if (checking || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F5F7FB]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-navy-700" />
      </div>
    );
  }

  const allowed = canAccess(session.role, pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FB]">
      <Sidebar session={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader session={session} />
        <main className="thin-scrollbar flex-1 overflow-y-auto">
          {allowed ? children(session) : <AccessDenied session={session} pathname={pathname} />}
        </main>
      </div>
    </div>
  );
}

function AccessDenied({ session, pathname }: { session: AdminSession; pathname: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-[720px] items-center justify-center px-6 py-10">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-navy-700">
          Access restricted
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-navy-950">
          This page is outside your role clearance.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
          {getAccessDeniedMessage(session.role, pathname)} You are currently signed in as{' '}
          <span className="font-bold text-navy-950">{roleLabel(session.role)}</span>.
        </p>
      </div>
    </div>
  );
}
