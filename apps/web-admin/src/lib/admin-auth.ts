export type AdminRole = 'BASIC_ADMIN' | 'INTERMEDIATE_ADMIN' | 'SUPER_ADMIN' | 'AUDITOR';

export interface AdminSession {
  adminUserId: string;
  email: string;
  fullName: string;
  role: AdminRole;
  mfaEnabled: boolean;
  lastLoginAt: string;
}

export type AdminPermission =
  | 'VIEW_DASHBOARD'
  | 'VIEW_TICKETS'
  | 'VIEW_CUSTOMERS'
  | 'VIEW_DISPUTES'
  | 'VIEW_AGENTS'
  | 'INITIATE_AGENT_PROFILING'
  | 'REVIEW_AGENT_ONBOARDING'
  | 'VIEW_CLAIMS'
  | 'REVIEW_KYC'
  | 'VIEW_PAYOUTS'
  | 'VIEW_FINANCE'
  | 'VIEW_DRAWS'
  | 'INITIATE_DRAW_SETUP'
  | 'APPROVE_OPERATIONAL_CHANGES'
  | 'VIEW_REPORTS'
  | 'VIEW_AUDIT_LOGS'
  | 'VIEW_SYSTEM_CONFIG'
  | 'MANAGE_ADMINS'
  | 'READ_ONLY_QUERY_ALL'
  | 'VIEW_WORKFLOWS'
  | 'REVIEW_WORKFLOWS'
  | 'FINAL_APPROVE_WORKFLOWS'
  | 'VIEW_NOTIFICATIONS'
  | 'VIEW_DRAW_SCHEDULE';

export type AdminAction =
  | 'CREATE_ADMIN_PROFILE'
  | 'APPROVE_ADMIN_PROFILE'
  | 'REJECT_ADMIN_PROFILE'
  | 'SUSPEND_ADMIN'
  | 'REVOKE_ADMIN'
  | 'INITIATE_AGENT_PROFILING'
  | 'APPROVE_AGENT_ONBOARDING'
  | 'CREATE_DRAW_SETUP_REQUEST'
  | 'APPROVE_DRAW_SETUP'
  | 'CHANGE_TICKET_PRICE'
  | 'CHANGE_DRAW_FORMULA'
  | 'VIEW_AUDIT_LOGS'
  | 'APPROVE_WORKFLOW_STAGE'
  | 'REJECT_WORKFLOW_STAGE'

const roleActionMap: Record<AdminRole, AdminAction[]> = {
  BASIC_ADMIN: [
    'INITIATE_AGENT_PROFILING',
    
  ],

  INTERMEDIATE_ADMIN: [
    'APPROVE_AGENT_ONBOARDING',
    'CREATE_DRAW_SETUP_REQUEST',
    'APPROVE_WORKFLOW_STAGE',
    'REJECT_WORKFLOW_STAGE',
    
  ],

  SUPER_ADMIN: [
    'CREATE_ADMIN_PROFILE',
    'APPROVE_ADMIN_PROFILE',
    'REJECT_ADMIN_PROFILE',
    'SUSPEND_ADMIN',
    'REVOKE_ADMIN',
    'INITIATE_AGENT_PROFILING',
    'APPROVE_AGENT_ONBOARDING',
    'CREATE_DRAW_SETUP_REQUEST',
    'APPROVE_DRAW_SETUP',
    'CHANGE_TICKET_PRICE',
    'CHANGE_DRAW_FORMULA',
    'VIEW_AUDIT_LOGS',
    'APPROVE_WORKFLOW_STAGE',
    'REJECT_WORKFLOW_STAGE',
  ],

  AUDITOR: [
    'VIEW_AUDIT_LOGS',
  ],
};

const finalApprovalActions = new Set<AdminAction>([
  'APPROVE_ADMIN_PROFILE',
  'REJECT_ADMIN_PROFILE',
  'SUSPEND_ADMIN',
  'REVOKE_ADMIN',
  'APPROVE_DRAW_SETUP',
  'CHANGE_TICKET_PRICE',
  'CHANGE_DRAW_FORMULA',
]);

const mutationActions = new Set<AdminAction>([
  'CREATE_ADMIN_PROFILE',
  'APPROVE_ADMIN_PROFILE',
  'REJECT_ADMIN_PROFILE',
  'SUSPEND_ADMIN',
  'REVOKE_ADMIN',
  'INITIATE_AGENT_PROFILING',
  'APPROVE_AGENT_ONBOARDING',
  'CREATE_DRAW_SETUP_REQUEST',
  'APPROVE_DRAW_SETUP',
  'CHANGE_TICKET_PRICE',
  'CHANGE_DRAW_FORMULA',
  'APPROVE_WORKFLOW_STAGE',
  'REJECT_WORKFLOW_STAGE',
]);

export function canPerformAdminAction(role: AdminRole, action: AdminAction): boolean {
  if (role === 'AUDITOR' && mutationActions.has(action)) return false;

  if (role === 'INTERMEDIATE_ADMIN' && finalApprovalActions.has(action)) {
    return false;
  }

  return roleActionMap[role].includes(action);
}

export function getAdminActionDeniedReason(role: AdminRole, action: AdminAction): string {
  if (role === 'AUDITOR' && mutationActions.has(action)) {
    return 'Auditor access is read-only. Auditors cannot create, edit, approve, reject, suspend, revoke, or initiate actions.';
  }

  if (role === 'INTERMEDIATE_ADMIN' && finalApprovalActions.has(action)) {
    return 'Intermediate Admin can perform first-level review, but cannot perform final authorization actions.';
  }

  if (role === 'BASIC_ADMIN') {
    return 'Basic Admin can only handle enquiry, status, and initiation-related actions.';
  }

  return `${roleLabel(role)} does not have permission to perform this action.`;
}

export function isFinalApprovalAction(action: AdminAction): boolean {
  return finalApprovalActions.has(action);
}

export function isMutationAction(action: AdminAction): boolean {
  return mutationActions.has(action);
}
const SESSION_KEY = 'surewina_admin_session';

const DEFAULT_SESSION: AdminSession = {
  adminUserId: 'usr_super_admin_001',
  email: 'super.admin@surewina.ng',
  fullName: 'Tunde Adekunle',
  role: 'SUPER_ADMIN',
  mfaEnabled: true,
  lastLoginAt: new Date().toISOString(),
};

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  BASIC_ADMIN: [
    'VIEW_DASHBOARD',
    'VIEW_TICKETS',
    'VIEW_CUSTOMERS',
    'VIEW_DISPUTES',
    'VIEW_AGENTS',
    'INITIATE_AGENT_PROFILING',
    'VIEW_CLAIMS',
    'VIEW_WORKFLOWS',
    'VIEW_NOTIFICATIONS'
  ],
  INTERMEDIATE_ADMIN: [
    'VIEW_DASHBOARD',
    'VIEW_TICKETS',
    'VIEW_CUSTOMERS',
    'VIEW_AGENTS',
    'REVIEW_AGENT_ONBOARDING',
    'VIEW_CLAIMS',
    'REVIEW_KYC',
    'VIEW_PAYOUTS',
    'VIEW_DRAWS',
    'INITIATE_DRAW_SETUP',
    'VIEW_REPORTS',
    'VIEW_WORKFLOWS',
    'REVIEW_WORKFLOWS',
    'VIEW_NOTIFICATIONS',
    'VIEW_DRAW_SCHEDULE',
  ],
  SUPER_ADMIN: [
    'VIEW_DASHBOARD',
    'VIEW_TICKETS',
    'VIEW_CUSTOMERS',
    'VIEW_DISPUTES',
    'VIEW_AGENTS',
    'INITIATE_AGENT_PROFILING',
    'REVIEW_AGENT_ONBOARDING',
    'VIEW_CLAIMS',
    'REVIEW_KYC',
    'VIEW_PAYOUTS',
    'VIEW_FINANCE',
    'VIEW_DRAWS',
    'INITIATE_DRAW_SETUP',
    'APPROVE_OPERATIONAL_CHANGES',
    'VIEW_REPORTS',
    'VIEW_AUDIT_LOGS',
    'VIEW_SYSTEM_CONFIG',
    'MANAGE_ADMINS',
    'VIEW_WORKFLOWS',
    'REVIEW_WORKFLOWS',
    'FINAL_APPROVE_WORKFLOWS',
    'VIEW_NOTIFICATIONS',
    'VIEW_DRAW_SCHEDULE',
  ],
  AUDITOR: [
    'VIEW_DASHBOARD',
    'VIEW_TICKETS',
    'VIEW_CUSTOMERS',
    'VIEW_AGENTS',
    'VIEW_CLAIMS',
    'VIEW_PAYOUTS',
    'VIEW_FINANCE',
    'VIEW_DRAWS',
    'VIEW_REPORTS',
    'VIEW_AUDIT_LOGS',
    'READ_ONLY_QUERY_ALL',
    'VIEW_WORKFLOWS',
    'VIEW_NOTIFICATIONS',
    'VIEW_DRAW_SCHEDULE',
  ],
};

const routePermissions: Array<{ path: string; permission: AdminPermission }> = [
  { path: '/', permission: 'VIEW_DASHBOARD' },
  { path: '/tickets', permission: 'VIEW_TICKETS' },
  { path: '/customers', permission: 'VIEW_CUSTOMERS' },
  { path: '/disputes', permission: 'VIEW_DISPUTES' },
  { path: '/agents', permission: 'VIEW_AGENTS' },
  { path: '/agents/onboarding', permission: 'REVIEW_AGENT_ONBOARDING' },
  { path: '/agents/super', permission: 'VIEW_AGENTS' },
  { path: '/claims', permission: 'VIEW_CLAIMS' },
  { path: '/kyc/review', permission: 'REVIEW_KYC' },
  { path: '/payouts', permission: 'VIEW_PAYOUTS' },
  { path: '/remittance', permission: 'VIEW_FINANCE' },
  { path: '/commission', permission: 'VIEW_FINANCE' },
  { path: '/jackpot-fund', permission: 'VIEW_FINANCE' },
  { path: '/draws/new', permission: 'INITIATE_DRAW_SETUP' },
  { path: '/draws', permission: 'VIEW_DRAWS' },
  { path: '/rng-seeds', permission: 'VIEW_DRAWS' },
  { path: '/reports', permission: 'VIEW_REPORTS' },
  { path: '/compliance/aml', permission: 'VIEW_AUDIT_LOGS' },
  { path: '/audit-log', permission: 'VIEW_AUDIT_LOGS' },
  { path: '/promotions', permission: 'VIEW_SYSTEM_CONFIG' },
  { path: '/config', permission: 'VIEW_SYSTEM_CONFIG' },
  { path: '/users', permission: 'MANAGE_ADMINS' },
  { path: '/workflows', permission: 'VIEW_WORKFLOWS' },
  { path: '/notifications', permission: 'VIEW_NOTIFICATIONS' },
  { path: '/draw-schedule', permission: 'VIEW_DRAW_SCHEDULE' },
];

export function getStoredSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (!isSupportedRole(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AdminSession) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

/** Returns the default seed session — used by the layout to start signed-in for demos. */
export function seedSessionIfMissing(): AdminSession {
  const existing = getStoredSession();
  if (existing) return existing;
  saveSession(DEFAULT_SESSION);
  return DEFAULT_SESSION;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'BASIC_ADMIN':
      return 'Basic Admin';
    case 'INTERMEDIATE_ADMIN':
      return 'Intermediate Admin';
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'AUDITOR':
      return 'Auditor';
  }
}

export function roleDescription(role: AdminRole): string {
  switch (role) {
    case 'BASIC_ADMIN':
      return 'Enquiries, ticket/customer status, and initiation tasks only.';
    case 'INTERMEDIATE_ADMIN':
      return 'First-level reviews, onboarding checks, KYC, payouts, and draw setup initiation.';
    case 'SUPER_ADMIN':
      return 'Final approvals, admin management, configuration, and authorization.';
    case 'AUDITOR':
      return 'Read-only query access across layers with no mutation or approval rights.';
  }
}

export function roleTone(role: AdminRole): string {
  switch (role) {
    case 'BASIC_ADMIN':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'INTERMEDIATE_ADMIN':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    case 'SUPER_ADMIN':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'AUDITOR':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
}

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return rolePermissions[role].includes(permission);
}

export function isReadOnlyRole(role: AdminRole): boolean {
  return role === 'AUDITOR';
}

export function canMutate(role: AdminRole): boolean {
  return !isReadOnlyRole(role);
}

export function canAccess(role: AdminRole, screen: string): boolean {
  const route = findRoutePermission(screen);
  if (!route) return role === 'SUPER_ADMIN';
  return hasPermission(role, route.permission);
}

export function getAccessDeniedMessage(role: AdminRole, screen: string): string {
  const route = findRoutePermission(screen);
  if (!route) return 'This section is restricted to Super Admin users until a permission is assigned.';
  return `${roleLabel(role)} does not have the ${route.permission.replaceAll('_', ' ').toLowerCase()} permission required for this section.`;
}

function findRoutePermission(screen: string) {
  return [...routePermissions]
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => screen === route.path || (route.path !== '/' && screen.startsWith(`${route.path}/`)));
}

function isSupportedRole(role: string): role is AdminRole {
  return ['BASIC_ADMIN', 'INTERMEDIATE_ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(role);
}
