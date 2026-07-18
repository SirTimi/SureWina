'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck, Wifi } from 'lucide-react';
import {
  type AdminSession,
  clearSession,
  roleLabel,
  roleTone,
} from '@/lib/admin-auth';
import { NotificationBell } from '@/components/notification-bell';
interface AdminHeaderProps {
  session: AdminSession;
}

export function AdminHeader({ session }: AdminHeaderProps) {
  const router = useRouter();
  const initials = session.fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');

  const logout = () => {
    clearSession();
    router.push('/sign-in');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Surewina admin
          </p>
          <p className="truncate text-sm font-bold text-[#0B1220]">
            {greeting()}, {session.fullName.split(' ')[0]}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            title="Backend is currently using mock data in this admin demo environment."
            className="hidden items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 sm:inline-flex"
          >
            <Wifi className="h-3 w-3" />
            Backend mocked
          </span>

          <span
            title={`Current access role: ${roleLabel(session.tier)}`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${roleBadgeTone(session.tier)}`}
          >
            <ShieldCheck className="h-3 w-3" />
            {roleLabel(session.tier)}
          </span>

          <NotificationBell session={session} />

          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1220] text-xs font-black text-white">
              {initials}
            </div>
            <div className="hidden text-right leading-tight md:block">
              <p className="text-xs font-bold text-[#0B1220]">{session.fullName}</p>
              <p className="text-[10px] text-slate-500">{session.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            title="Sign out of the admin portal"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function roleBadgeTone(tier: AdminSession['tier']) {
  if (tier === 'BASIC_ADMIN') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (tier === 'INTERMEDIATE_ADMIN') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (tier === 'SUPER_ADMIN') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (tier === 'AUDITOR') return 'border-violet-200 bg-violet-50 text-violet-700';
  return roleTone(tier);
}
