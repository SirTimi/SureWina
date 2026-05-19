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
  items: Array<{ label: string; href: string; icon: typeof Gauge }>;
}> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Draws',
    items: [
      { label: 'All draws', href: '/draws', icon: Trophy },
      { label: 'RNG seeds', href: '/rng-seeds', icon: KeyRound },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Tickets', href: '/tickets', icon: Ticket },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Disputes', href: '/disputes', icon: MessageSquare },
    ],
  },
  {
    label: 'Agents',
    items: [
      { label: 'Agents', href: '/agents', icon: UserCog },
      { label: 'Onboarding', href: '/agents/onboarding', icon: ClipboardCheck },
      { label: 'Super-agents', href: '/agents/super', icon: GitBranch },
    ],
  },
  {
    label: 'Claims & payouts',
    items: [
      { label: 'Claims pipeline', href: '/claims', icon: Flag },
      { label: 'KYC review', href: '/kyc/review', icon: ShieldCheck },
      { label: 'Payouts', href: '/payouts', icon: Banknote },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Remittance', href: '/remittance', icon: Wallet },
      { label: 'Commission', href: '/commission', icon: Coins },
      { label: 'Jackpot fund', href: '/jackpot-fund', icon: Gauge },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Reports', href: '/reports', icon: FileBarChart },
      { label: 'AML flags', href: '/compliance/aml', icon: AlertOctagon },
      { label: 'Audit log', href: '/audit-log', icon: ScrollText },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Promotions', href: '/promotions', icon: Receipt },
      { label: 'Config', href: '/config', icon: Settings },
      { label: 'Admin users', href: '/users', icon: BookOpen },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-[260px] shrink-0 flex-col border-r border-white/5 bg-[#013aa7] text-white lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">
            Admin
          </p>
          <p className="text-xs font-bold text-white/60">Operator console</p>
        </div>
      </div>

      <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                        ? 'flex items-center gap-3 rounded-lg bg-[#f9cb0b] px-3 py-2 text-sm font-bold text-white shadow-[0_8px_22px_rgba(78,143,1,0.35)]'
                        : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/65 transition hover:bg-white/5 hover:text-white'
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 px-5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
          Build
        </p>
        <p className="mt-1 font-mono text-xs text-white/55">v0.5 · admin</p>
      </div>
    </aside>
  );
}
