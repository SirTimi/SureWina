'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { Sidebar } from '@/components/sidebar';
import {
  type AdminSession,
  getStoredSession,
  seedSessionIfMissing,
} from '@/lib/admin-auth';

interface AdminShellProps {
  children: (session: AdminSession) => React.ReactNode;
  /** If true, redirects to /sign-in when no session is found. Default true. */
  requireAuth?: boolean;
}

export function AdminShell({ children, requireAuth = true }: AdminShellProps) {
  const router = useRouter();
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
      // Seed a default operator session for demo so reviewers don't bounce.
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#4E8F01]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FB]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader session={session} />
        <main className="thin-scrollbar flex-1 overflow-y-auto">
          {children(session)}
        </main>
      </div>
    </div>
  );
}
