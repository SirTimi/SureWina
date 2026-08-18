'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Banknote,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileBarChart,
  Flag,
  Gauge,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  ScanLine,
  ScrollText,
  Settings,
  Ticket,
  Trophy,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { Logo } from '@surewina/ui';
import type { AdminFunction, AdminPermission, AdminSession } from '@/lib/admin-auth';
import { hasPermission, roleDescription, roleLabel } from '@/lib/admin-auth';

const navGroups: Array<{
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: typeof Gauge;
    help: string;
    permission: AdminPermission;
    /** Departments whose endpoints back this page. Omit = open to all. */
    roles?: AdminFunction[];
    /**
     * Disables the SUPER clearance bypass below. Set on pages whose routes
     * carry @DepartmentOnly() — clearance does not substitute for being in
     * the department, so showing the link to a super admin would 403.
     */
    departmentOnly?: boolean;
    readOnly?: boolean;
  }>;
}> = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
        help: 'Main admin dashboard and operational overview',
        permission: 'VIEW_DASHBOARD',
      },
    ],
  },
  {
    label: 'Draws',
    items: [
      {
        label: 'All draws',
        href: '/draws',
        icon: Trophy,
        help: 'View and manage draw records',
        permission: 'VIEW_DRAWS',
        roles: ['OPERATOR'],
      },
      {
        label: 'RNG seeds',
        href: '/rng-seeds',
        icon: KeyRound,
        help: 'Review RNG seed commitments and draw verification',
        permission: 'VIEW_DRAWS',
        roles: ['OPERATOR'],
      },
      {
        label: 'Schedule config',
        href: '/draws/schedule',
        icon: CalendarClock,
        help: 'Recurring draw prices, prizes, and times — versioned with dual approval',
        permission: 'VIEW_DRAW_SCHEDULE',
        roles: ['OPERATOR'],
      },
    ],
  },
  {
    label: 'Customers',
    items: [
      {
        label: 'Tickets',
        href: '/tickets',
        icon: Ticket,
        help: 'Search tickets by reference or phone, and browse payments',
        permission: 'VIEW_TICKETS',
        roles: ['OPERATOR'],
      },
      {
        label: 'Customers',
        href: '/customers',
        icon: Users,
        help: 'Look up customer profiles and account status',
        permission: 'VIEW_CUSTOMERS',
        roles: ['OPERATOR'],
      },
      {
        label: 'Disputes',
        href: '/disputes',
        icon: MessageSquare,
        help: 'Customer complaints and internal flags, open to resolution',
        permission: 'VIEW_DISPUTES',
        roles: ['OPERATOR'],
      },
    ],
  },
  {
    label: 'Agents',
    items: [
      {
        label: 'Agents',
        href: '/agents',
        icon: UserCog,
        help: 'Manage agent records and account status',
        permission: 'VIEW_AGENTS',
        roles: ['OPERATOR'],
      },
      {
        label: 'Onboarding',
        href: '/agents/onboarding',
        icon: ClipboardCheck,
        help: 'Register agents in office and activate them',
        permission: 'REVIEW_AGENT_ONBOARDING',
        roles: ['OPERATOR'],
      },
    ],
  },
  {
    label: 'Claims & payouts',
    items: [
      {
        label: 'Claims pipeline',
        href: '/claims',
        icon: Flag,
        help: 'Track prize claims from notification to fulfilment, including KYC review',
        permission: 'VIEW_CLAIMS',
        roles: ['COMPLIANCE_OFFICER'],
      },
      {
        label: 'Collection point',
        href: '/collection-point',
        icon: ScanLine,
        help: 'Verify a winner’s code and ticket, then record the handover',
        permission: 'VIEW_COLLECTION_POINT',
        roles: ['SUPPORT_AGENT'],
        departmentOnly: true,
      },
      {
        label: 'Payouts',
        href: '/payouts',
        icon: Banknote,
        help: 'Prize payouts by bank transfer and agent cash',
        permission: 'VIEW_PAYOUTS',
        roles: ['FINANCE_OFFICER'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Remittance',
        href: '/remittance',
        icon: Wallet,
        help: 'Agent remittances and outstanding balances',
        permission: 'VIEW_FINANCE',
        roles: ['FINANCE_OFFICER'],
      },
      {
        label: 'Jackpot entries',
        href: '/jackpot-fund',
        icon: Gauge,
        help: 'Entries into upcoming jackpot draws, direct and accumulated',
        permission: 'VIEW_FINANCE',
        roles: ['OPERATOR'],
      },
    ],
  },
  {
    label: 'Compliance',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        icon: FileBarChart,
        help: 'Daily regulatory report, levy, WHT, sales, financial, and agent reports',
        permission: 'VIEW_REPORTS',
        roles: ['COMPLIANCE_OFFICER'],
      },
      {
        label: 'Audit log',
        href: '/audit-log',
        icon: ScrollText,
        help: 'Append-only record of every consequential action, with integrity checkpoints',
        permission: 'VIEW_AUDIT_LOGS',
        roles: ['COMPLIANCE_OFFICER'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Config',
        href: '/config',
        icon: Settings,
        help: 'Business thresholds: WHT, levy, and agent payout limits',
        permission: 'VIEW_SYSTEM_CONFIG',
        roles: ['OPERATOR'],
      },
      {
        label: 'Admin users',
        href: '/users',
        icon: BookOpen,
        help: 'Manage admin accounts, clearance, and access',
        permission: 'MANAGE_ADMINS',
        roles: ['OPERATOR'],
      },
    ],
  },
];

export function Sidebar({ session }: { session: AdminSession }) {
  const pathname = usePathname();

  // Two gates, matching the backend: clearance decides how consequential an
  // action may be, department decides which endpoints answer at all. SUPER
  // spans departments — same rule the role guard applies server-side, so the
  // nav never shows a link that would 403.
  //
  // The exception is departmentOnly items, which mirror @DepartmentOnly()
  // routes. There the department is the control and SUPER does not bypass it.
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!hasPermission(session.tier, item.permission)) return false;
        if (!item.roles) return true;
        if (item.roles.includes(session.role)) return true;
        return session.tier === 'SUPER_ADMIN' && !item.departmentOnly;
      }),
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