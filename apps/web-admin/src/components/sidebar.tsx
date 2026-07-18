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
  GitPullRequestArrow,
  Bell,
  CalendarClock,
  FlagTriangleRight,
} from 'lucide-react';
import { Logo } from '@surewina/ui';
import type { AdminPermission, AdminSession } from '@/lib/admin-auth';
import { hasPermission, roleDescription, roleLabel } from '@/lib/admin-auth';

const navGroups: Array<{
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: typeof Gauge;
    help: string;
    permission: AdminPermission;
    readOnly?: boolean;
  }>;
}> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard, help: 'Main admin dashboard and operational overview', permission: 'VIEW_DASHBOARD' }],
  },
  {
    label: 'Notifications',
    items: [
      { 
        label: 'All notifications', 
        href: '/notifications', 
        icon: Bell, 
        help: 'View approval alerts, escalations, overdue tasks, and workflow notifications', 
        permission: 'VIEW_NOTIFICATIONS' 
      },
    ],
  },
  {
    label: 'Draws',
    items: [
      { label: 'All draws', href: '/draws', icon: Trophy, help: 'View and manage draw records', permission: 'VIEW_DRAWS' },
      { label: 'RNG seeds', href: '/rng-seeds', icon: KeyRound, help: 'Review RNG seed commitments and draw verification', permission: 'VIEW_DRAWS' },
      {
        label: 'Schedule config',
        href: '/draws/schedule',
        icon: CalendarClock,
        help: 'Configure recurring draw schedules, cutoff rules, price versions, and effective dates',
        permission: 'VIEW_DRAW_SCHEDULE',
      },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Tickets', href: '/tickets', icon: Ticket, help: 'Search and review customer ticket records', permission: 'VIEW_TICKETS' },
      { label: 'Customers', href: '/customers', icon: Users, help: 'View customer profiles and account status', permission: 'VIEW_CUSTOMERS' },
      { label: 'Disputes', href: '/disputes', icon: MessageSquare, help: 'Review customer disputes and complaints', permission: 'VIEW_DISPUTES' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { label: 'Agents', href: '/agents', icon: UserCog, help: 'Manage agent records and performance status', permission: 'VIEW_AGENTS' },
      { label: 'Onboarding', href: '/agents/onboarding', icon: ClipboardCheck, help: 'Review agent onboarding and profiling requests', permission: 'REVIEW_AGENT_ONBOARDING' },
      { label: 'Super-agents', href: '/agents/super', icon: GitBranch, help: 'Manage super-agent hierarchy and reporting lines', permission: 'VIEW_AGENTS' },
    ],
  },
  {
    label: 'Claims & payouts',
    items: [
      { label: 'Claims pipeline', href: '/claims', icon: Flag, help: 'Track prize claims from submission to closure', permission: 'VIEW_CLAIMS' },
      { label: 'KYC review', href: '/kyc/review', icon: ShieldCheck, help: 'Review customer identity and payout documents', permission: 'REVIEW_KYC' },
      { label: 'Payouts', href: '/payouts', icon: Banknote, help: 'Review and approve payout activity', permission: 'VIEW_PAYOUTS' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Remittance', href: '/remittance', icon: Wallet, help: 'Track agent remittance and outstanding balances', permission: 'VIEW_FINANCE' },
      { label: 'Commission', href: '/commission', icon: Coins, help: 'Review agent commissions and earning rules', permission: 'VIEW_FINANCE' },
      { label: 'Jackpot fund', href: '/jackpot-fund', icon: Gauge, help: 'Monitor jackpot fund status and controls', permission: 'VIEW_FINANCE' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'Reports', href: '/reports', icon: FileBarChart, help: 'Open compliance, finance, and operations reports', permission: 'VIEW_REPORTS' },
      { label: 'AML flags', href: '/compliance/aml', icon: AlertOctagon, help: 'Review suspicious activity and AML alerts', permission: 'VIEW_AUDIT_LOGS' },
      { label: 'Audit log', href: '/audit-log', icon: ScrollText, help: 'View admin action history and audit trails', permission: 'VIEW_AUDIT_LOGS' },
      {
        label: 'Escalations',
        href: '/escalations',
        icon: FlagTriangleRight,
        help: 'Auditor escalation channel for management review outside normal approval flow',
        permission: 'VIEW_ESCALATIONS',
      },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Promotions', href: '/promotions', icon: Receipt, help: 'Manage platform promotions and campaign rules', permission: 'VIEW_SYSTEM_CONFIG' },
      { label: 'Config', href: '/config', icon: Settings, help: 'View platform configuration settings', permission: 'VIEW_SYSTEM_CONFIG' },
      { label: 'Admin users', href: '/users', icon: BookOpen, help: 'Manage admin users and access profiles', permission: 'MANAGE_ADMINS' },
    ],
  },
  {
    label: 'Workflows',
    items: [
      {
        label: 'Approval workflows',
        href: '/workflows',
        icon: GitPullRequestArrow,
        help: 'Track sensitive requests moving through review and approval stages',
        permission: 'VIEW_WORKFLOWS',
      },
    ],
  },
  ];

export function Sidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(session.tier, item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="hidden h-screen w-[260px] shrink-0 flex-col border-r border-white/5 bg-primary text-white lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-400">Admin</p>
          <p className="text-xs font-bold text-white/60">{roleLabel(session.tier)}</p>
        </div>
      </div>

      <div className="border-b border-white/5 px-5 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Clearance</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">{roleDescription(session.tier)}</p>
      </div>

      <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
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
