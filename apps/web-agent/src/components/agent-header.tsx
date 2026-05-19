'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Banknote,
  Home,
  LogOut,
  Menu,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Logo } from '@surewina/ui';
import type { AgentMe } from '@surewina/types';
import { clearAgentSession } from '@/lib/agent-auth';

const navItems = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Sell', href: '/sell', icon: QrCode },
  { label: 'Remit', href: '/remittance', icon: ReceiptText },
  { label: 'Commission', href: '/commission', icon: Banknote },
  { label: 'Profile', href: '/profile', icon: User },
];

interface AgentHeaderProps {
  agent: AgentMe;
}

export function AgentHeader({ agent }: AgentHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remittanceState = useMemo(() => {
    const deadline = new Date(agent.nextRemittanceDeadlineAt).getTime();
    const diff = deadline - Date.now();
    const hours = Math.max(0, Math.floor(diff / (60 * 60 * 1000)));
    const minutes = Math.max(0, Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000)));

    if (agent.remittanceOverdue) {
      return {
        label: 'Overdue',
        className: 'bg-red-50 text-red-700 border-red-100',
      };
    }

    if (hours < 2) {
      return {
        label: `${hours}h ${minutes}m left`,
        className: 'bg-amber-50 text-amber-700 border-amber-100',
      };
    }

    return {
      label: `${hours}h ${minutes}m left`,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };
  }, [agent.nextRemittanceDeadlineAt, agent.remittanceOverdue]);

  const logout = () => {
    clearAgentSession();
    setOpen(false);
    router.push('/sign-in');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-navy-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Surewina agent home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 rounded-sm border border-slate-200 bg-[#F8FAF4] p-1 lg:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'inline-flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-2 text-sm font-bold text-white'
                    : 'inline-flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-bold text-slate-600 hover:bg-amber-50 hover:text-navy-700'
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <div className="rounded-sm border border-slate-200 bg-white px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Agent ID
            </p>
            <p className="font-mono text-xs font-black text-navy-950">
              {agent.agentCode}
            </p>
          </div>

          <div className="rounded-sm bg-navy-800 px-3 py-2 text-white">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-400">
              Tier
            </p>
            <p className="text-xs font-black">{agent.tier}</p>
          </div>

          <div className={`rounded-sm border px-3 py-2 ${remittanceState.className}`}>
            <p className="text-[9px] font-black uppercase tracking-[0.14em]">
              Remit by
            </p>
            <p className="text-xs font-black">{remittanceState.label}</p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-navy-950 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="border-t border-slate-100 bg-white px-4 py-2 sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Agent" value={agent.agentCode.replace('RD-AGT-', '')} />
          <MiniStat label="Tier" value={agent.tier} />
          <MiniStat label="Remit" value={remittanceState.label} />
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    active
                      ? 'flex items-center gap-2 rounded-sm bg-navy-800 px-3 py-3 text-sm font-bold text-white'
                      : 'flex items-center gap-2 rounded-sm bg-[#F8FAF4] px-3 py-3 text-sm font-bold text-slate-700'
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={logout}
              className="col-span-2 flex items-center justify-center gap-2 rounded-sm bg-red-50 px-3 py-3 text-sm font-bold text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-200 bg-[#F8FAF4] px-2 py-1.5">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="truncate text-xs font-black text-navy-950">{value}</p>
    </div>
  );
}