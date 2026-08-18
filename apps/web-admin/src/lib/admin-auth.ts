export type AdminRole = 'BASIC_ADMIN' | 'INTERMEDIATE_ADMIN' | 'SUPER_ADMIN' | 'AUDITOR';

export type AdminFunction = 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';

export interface AdminSession {
  adminUserId: string;
  email: string;
  fullName: string;
  role: AdminFunction;   // department / functional role (guards backend endpoints)
  tier: AdminRole;       // authority tier — drives the permission maps below
  mfaEnabled: boolean;
  lastLoginAt: string;
  mustChangePassword: boolean;
  // Set for support staff who work a collection point. Null for everyone
  // else, and null on a support account means unscoped — worth surfacing in
  // the admin list, since it lets them redeem a claim booked anywhere.
  collectionPointId?: string | null;
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
  | 'VIEW_DRAW_SCHEDULE'
  | 'VIEW_ESCALATIONS'
  | 'RAISE_ESCALATION'
  | 'RESPOND_TO_ESCALATION'
  | 'VIEW_COLLECTION_POINT';

export type AdminAction =
  | 'CREATE_ADMIN_PROFILE'
  | 'APPROVE_ADMIN_PROFILE'
  | 'REJECT_ADMIN_PROFILE'
  | 'SUSPEND_ADMIN'
  | 'REVOKE_ADMIN'
  | 'INITIATE_AGENT_PROFILING'
  | 'APPROVE_AGENT_ONBOARDING'
  | 'REACTIVATE_AGENT'
  | 'REVIEW_CLAIM_KYC'
  | 'REDEEM_PRIZE'
  | 'CREATE_DRAW_SETUP_REQUEST'
  | 'APPROVE_DRAW_SETUP'
  | 'CHANGE_TICKET_PRICE'
  | 'CHANGE_DRAW_FORMULA'
  | 'VIEW_AUDIT_LOGS'
  | 'APPROVE_WORKFLOW_STAGE'
  | 'REJECT_WORKFLOW_STAGE'
  | 'RAISE_ESCALATION'
  | 'RESPOND_TO_ESCALATION'

const roleActionMap: Record<AdminRole, AdminAction[]> = {
  BASIC_ADMIN: [
    'INITIATE_AGENT_PROFILING',
    // Counter staff sit at the lowest tier — handing a prize over is the job,
    // not a level of seniority. The department gate below is the real control.
    'REDEEM_PRIZE',
  ],

  INTERMEDIATE_ADMIN: [
    'INITIATE_AGENT_PROFILING',
    'APPROVE_AGENT_ONBOARDING',
    'CREATE_DRAW_SETUP_REQUEST',
    'APPROVE_WORKFLOW_STAGE',
    'REJECT_WORKFLOW_STAGE',
    'REACTIVATE_AGENT',
    'REVIEW_CLAIM_KYC',
    'REDEEM_PRIZE',
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
    'RESPOND_TO_ESCALATION',
    'REACTIVATE_AGENT',
    'REVIEW_CLAIM_KYC',
    'REDEEM_PRIZE',
  ],

  AUDITOR: [
    'VIEW_AUDIT_LOGS',
    'RAISE_ESCALATION',
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
  'RAISE_ESCALATION',
  'RESPOND_TO_ESCALATION',
  'REACTIVATE_AGENT',
  'REVIEW_CLAIM_KYC',
  'REDEEM_PRIZE',
]);

// ─── DEPARTMENT GATING ─────────────────────────────────────
//
// Tier answers "is this person senior enough?". Department answers "is this
// their job?". Most actions only need the first. A few need both, because the
// officer performing them is attesting to something only their department can
// attest to — a compliance sign-off is worthless if operations can issue it.
//
// Mirrors @AdminRoles(...) + @DepartmentOnly() on the backend routes. Keep the
// two in step: a mismatch shows an enabled button that then 403s.
const actionRequiredFunctions: Partial<Record<AdminAction, AdminFunction[]>> = {
  // Letting an agent sell — first time, or after a suspension.
  APPROVE_AGENT_ONBOARDING: ['COMPLIANCE_OFFICER'],
  REACTIVATE_AGENT: ['COMPLIANCE_OFFICER'],
  // Identity review on a prize claim.
  REVIEW_CLAIM_KYC: ['COMPLIANCE_OFFICER'],
  // Releasing a prize at the counter. The person handing over cash or goods
  // is the person accountable for that counter — clearance does not
  // substitute for standing behind it.
  REDEEM_PRIZE: ['SUPPORT_AGENT'],
};

// Screens whose visibility follows the department rather than the tier. The
// tier maps below grant these broadly; this narrows them so a finance officer
// is not shown a counter they cannot use.
const permissionRequiredFunctions: Partial<Record<AdminPermission, AdminFunction[]>> = {
  VIEW_COLLECTION_POINT: ['SUPPORT_AGENT'],
};

// Tier-only check. Correct for actions with no department requirement; for the
// rest prefer canPerformAction(session, action), which applies both gates.
export function canPerformAdminAction(role: AdminRole, action: AdminAction): boolean {
  if (
    role === 'AUDITOR' &&
    mutationActions.has(action) &&
    action !== 'RAISE_ESCALATION'
  ) {
    return false;
  }

  if (role === 'INTERMEDIATE_ADMIN' && finalApprovalActions.has(action)) {
    return false;
  }

  return roleActionMap[role].includes(action);
}

export function getAdminActionDeniedReason(role: AdminRole, action: AdminAction): string {
  if (role === 'AUDITOR' && mutationActions.has(action) && action !== 'RAISE_ESCALATION') {
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

// Both gates. Tier is checked first so an auditor is told they are read-only
// rather than told they are in the wrong department.
export function canPerformAction(session: AdminSession, action: AdminAction): boolean {
  if (!canPerformAdminAction(session.tier, action)) return false;

  const departments = actionRequiredFunctions[action];
  if (departments && !departments.includes(session.role)) return false;

  return true;
}

export function getActionDeniedReason(session: AdminSession, action: AdminAction): string {
  if (!canPerformAdminAction(session.tier, action)) {
    return getAdminActionDeniedReason(session.tier, action);
  }

  const departments = actionRequiredFunctions[action];
  if (departments && !departments.includes(session.role)) {
    const allowed = departments.map(functionLabel).join(' or ');
    return `This action is restricted to ${allowed}. Your account is registered to ${functionLabel(
      session.role,
    )}, so it cannot be performed here regardless of clearance.`;
  }

  return `${roleLabel(session.tier)} does not have permission to perform this action.`;
}

export function getActionRequiredFunctions(action: AdminAction): AdminFunction[] | null {
  return actionRequiredFunctions[action] ?? null;
}

export function isDepartmentGatedAction(action: AdminAction): boolean {
  return action in actionRequiredFunctions;
}

export function isFinalApprovalAction(action: AdminAction): boolean {
  return finalApprovalActions.has(action);
}

export function isMutationAction(action: AdminAction): boolean {
  return mutationActions.has(action);
}
const SESSION_KEY = 'surewina_admin_session';


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
    'VIEW_NOTIFICATIONS',
    'VIEW_COLLECTION_POINT',
  ],
  INTERMEDIATE_ADMIN: [
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
    'VIEW_DRAWS',
    'INITIATE_DRAW_SETUP',
    'VIEW_REPORTS',
    'VIEW_WORKFLOWS',
    'REVIEW_WORKFLOWS',
    'VIEW_NOTIFICATIONS',
    'VIEW_DRAW_SCHEDULE',
    'VIEW_COLLECTION_POINT',
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
    'VIEW_ESCALATIONS',
    'RESPOND_TO_ESCALATION',
    'VIEW_COLLECTION_POINT',
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
    'VIEW_ESCALATIONS',
    'RESPOND_TO_ESCALATION',
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
  { path: '/collection-point', permission: 'VIEW_COLLECTION_POINT' },
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
  { path: '/escalations/new', permission: 'RAISE_ESCALATION' },
  { path: '/escalations', permission: 'VIEW_ESCALATIONS' },
];

export function getStoredSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    if (!isSupportedRole(parsed.tier)) return null;   // validate tier, not role
    // Sessions stored before department gating existed carry no functional
    // role. Treating that as "no department" would silently deny compliance
    // actions, so force a fresh sign-in instead.
    if (!isSupportedFunction(parsed.role)) return null;
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

export function functionLabel(fn: AdminFunction): string {
  switch (fn) {
    case 'OPERATOR':
      return 'Operations';
    case 'COMPLIANCE_OFFICER':
      return 'Compliance';
    case 'FINANCE_OFFICER':
      return 'Finance';
    case 'SUPPORT_AGENT':
      return 'Support';
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

// Tier-only screen check. Kept for callers that have no session to hand; new
// code should use canAccessScreen(session, screen), which also applies the
// department narrowing.
export function canAccess(role: AdminRole, screen: string): boolean {
  const route = findRoutePermission(screen);
  if (!route) return role === 'SUPER_ADMIN';
  return hasPermission(role, route.permission);
}

export function canAccessScreen(session: AdminSession, screen: string): boolean {
  const route = findRoutePermission(screen);
  if (!route) return session.tier === 'SUPER_ADMIN';
  if (!hasPermission(session.tier, route.permission)) return false;

  const departments = permissionRequiredFunctions[route.permission];
  if (departments && !departments.includes(session.role)) return false;

  return true;
}

export function getAccessDeniedMessage(role: AdminRole, screen: string): string {
  const route = findRoutePermission(screen);
  if (!route) return 'This section is restricted to Super Admin users until a permission is assigned.';
  return `${roleLabel(role)} does not have the ${route.permission.replaceAll('_', ' ').toLowerCase()} permission required for this section.`;
}

export function getScreenDeniedMessage(session: AdminSession, screen: string): string {
  const route = findRoutePermission(screen);
  if (route) {
    const departments = permissionRequiredFunctions[route.permission];
    if (
      hasPermission(session.tier, route.permission) &&
      departments &&
      !departments.includes(session.role)
    ) {
      const allowed = departments.map(functionLabel).join(' or ');
      return `This section is for ${allowed} staff. Your account is registered to ${functionLabel(
        session.role,
      )}.`;
    }
  }
  return getAccessDeniedMessage(session.tier, screen);
}

export function getPermissionRequiredFunctions(
  permission: AdminPermission,
): AdminFunction[] | null {
  return permissionRequiredFunctions[permission] ?? null;
}

function findRoutePermission(screen: string) {
  return [...routePermissions]
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => screen === route.path || (route.path !== '/' && screen.startsWith(`${route.path}/`)));
}

function isSupportedRole(role: string): role is AdminRole {
  return ['BASIC_ADMIN', 'INTERMEDIATE_ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(role);
}

function isSupportedFunction(fn: string): fn is AdminFunction {
  return ['OPERATOR', 'COMPLIANCE_OFFICER', 'FINANCE_OFFICER', 'SUPPORT_AGENT'].includes(fn);
}