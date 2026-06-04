'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertOctagon,
  Banknote,
  BookOpen,
  ClipboardCheck,
  Coins,
  FileBarChart,
  Flag,
  Gauge,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Ticket,
  Trophy,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { Logo } from '@surewina/ui';

const navGroups: Array<{
  label: string;
  items: Array<{ label: string; href: string; icon: typeof Gauge; help: string }>;
}> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard, help: 'Main admin dashboard and operational overview' }],
  },
  {
    label: 'Draws',
    items: [
      { label: 'All draws', href: '/draws', icon: Trophy, help: 'View and manage draw records' },
      { label: 'RNG seeds', href: '/rng-seeds', icon: KeyRound, help: 'Review RNG seed commitments and draw verification' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Tickets', href: '/tickets', icon: Ticket, help: 'Search and review customer ticket records' },
      { label: 'Customers', href: '/customers', icon: Users, help: 'View customer profiles and account status' },
      { label: 'Disputes', href: '/disputes', icon: MessageSquare, help: 'Review customer disputes and complaints' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { label: 'Agents', href: '/agents', icon: UserCog, help: 'Manage agent records and performance status' },
      { label: 'Onboarding', href: '/agents/onboarding', icon: ClipboardCheck, help: 'Review agent onboarding and profiling requests' },
      { label: 'Super-agents', href: '/agents/super', icon: GitBranch, help: 'Manage super-agent hierarchy and reporting lines' },
    ],
  },
  {
    label: 'Claims & payouts',
    items: [
      { label: 'Claims pipeline', href: '/claims', icon: Flag, help: 'Track prize claims from submission to closure' },
      { label: 'KYC review', href: '/kyc/review', icon: ShieldCheck, help: 'Review customer identity and payout documents' },
      { label: 'Payouts', href: '/payouts', icon: Banknote, help: 'Review and approve payout activity' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Remittance', href: '/remittance', icon: Wallet, help: 'Track agent remittance and outstanding balances' },
      { label: 'Commission', href: '/commission', icon: Coins, help: 'Review agent commissions and earning rules' },
      { label: 'Jackpot fund', href: '/jackpot-fund', icon: Gauge, help: 'Monitor jackpot fund status and controls' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Reports', href: '/reports', icon: FileBarChart, help: 'Open compliance, finance, and operations reports' },
      { label: 'AML flags', href: '/compliance/aml', icon: AlertOctagon, help: 'Review suspicious activity and AML alerts' },
      { label: 'Audit log', href: '/audit-log', icon: ScrollText, help: 'View admin action history and audit trails' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Promotions', href: '/promotions', icon: Receipt, help: 'Manage platform promotions and campaign rules' },
      { label: 'Config', href: '/config', icon: Settings, help: 'View platform configuration settings' },
      { label: 'Admin users', href: '/users', icon: BookOpen, help: 'Manage admin users and access profiles' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-[260px] shrink-0 flex-col border-r border-white/5 bg-primary text-white lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Admin</p>
          <p className="text-xs font-bold text-white/60">Operator console</p>
        </div>
      </div>

      <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={`${item.label}: ${item.help}`}
                    aria-label={`${item.label}: ${item.help}`}
                    className={
                      active
                        ? 'group relative flex items-center gap-3 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-accent-foreground shadow-[0_8px_22px_rgba(249,203,11,0.28)]'
                        : 'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/65 transition hover:bg-white/5 hover:text-white'
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden w-64 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-relaxed text-slate-700 shadow-xl group-hover:block">
                      {item.help}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 px-5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Build</p>
        <p className="mt-1 font-mono text-xs text-white/55">v0.5 · admin</p>
      </div>
    </aside>
  );
}
