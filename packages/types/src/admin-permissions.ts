export type AdminRole = 'BASIC_ADMIN' | 'INTERMEDIATE_ADMIN' | 'SUPER_ADMIN' | 'AUDITOR';

export type AdminPermission =
  | 'agents:view'
  | 'agents:initiate_profile'
  | 'agents:approve_onboarding'
  | 'draws:view'
  | 'draws:create_setup_request'
  | 'draws:approve_setup'
  | 'draws:change_ticket_price'
  | 'draws:change_formula'
  | 'audit:view_logs'
  | 'admins:view'
  | 'admins:create'
  | 'admins:approve'
  | 'admins:suspend'
  | 'reports:view'
  | 'finance:view'
  | 'payouts:view'
  | 'payouts:approve'
  | 'query:read_all';

export type AdminAction =
  | 'VIEW_AGENTS'
  | 'INITIATE_AGENT_PROFILING'
  | 'APPROVE_AGENT_ONBOARDING'
  | 'CREATE_DRAW_SETUP_REQUEST'
  | 'APPROVE_DRAW_SETUP'
  | 'VIEW_AUDIT_LOGS'
  | 'MANAGE_ADMINS'
  | 'CHANGE_TICKET_PRICE'
  | 'CHANGE_DRAW_FORMULA';

export const adminRolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  BASIC_ADMIN: [
    'agents:view',
    'agents:initiate_profile',
  ],
  INTERMEDIATE_ADMIN: [
    'agents:view',
    'agents:approve_onboarding',
    'draws:view',
    'draws:create_setup_request',
    'reports:view',
    'payouts:view',
  ],
  SUPER_ADMIN: [
    'agents:view',
    'agents:initiate_profile',
    'agents:approve_onboarding',
    'draws:view',
    'draws:create_setup_request',
    'draws:approve_setup',
    'draws:change_ticket_price',
    'draws:change_formula',
    'audit:view_logs',
    'admins:view',
    'admins:create',
    'admins:approve',
    'admins:suspend',
    'reports:view',
    'finance:view',
    'payouts:view',
    'payouts:approve',
  ],
  AUDITOR: [
    'agents:view',
    'draws:view',
    'audit:view_logs',
    'admins:view',
    'reports:view',
    'finance:view',
    'payouts:view',
    'query:read_all',
  ],
};

export const adminActionPermissions: Record<AdminAction, AdminPermission> = {
  VIEW_AGENTS: 'agents:view',
  INITIATE_AGENT_PROFILING: 'agents:initiate_profile',
  APPROVE_AGENT_ONBOARDING: 'agents:approve_onboarding',
  CREATE_DRAW_SETUP_REQUEST: 'draws:create_setup_request',
  APPROVE_DRAW_SETUP: 'draws:approve_setup',
  VIEW_AUDIT_LOGS: 'audit:view_logs',
  MANAGE_ADMINS: 'admins:create',
  CHANGE_TICKET_PRICE: 'draws:change_ticket_price',
  CHANGE_DRAW_FORMULA: 'draws:change_formula',
};

export const mutatingAdminPermissions = new Set<AdminPermission>([
  'agents:initiate_profile',
  'agents:approve_onboarding',
  'draws:create_setup_request',
  'draws:approve_setup',
  'draws:change_ticket_price',
  'draws:change_formula',
  'admins:create',
  'admins:approve',
  'admins:suspend',
  'payouts:approve',
]);

export const selfApprovalBlockedActions = new Set<AdminAction>([
  'APPROVE_AGENT_ONBOARDING',
  'APPROVE_DRAW_SETUP',
  'CHANGE_TICKET_PRICE',
  'CHANGE_DRAW_FORMULA',
]);

export const intermediateInitiationBlockedActions = new Set<AdminAction>([
  'APPROVE_AGENT_ONBOARDING',
  'APPROVE_DRAW_SETUP',
  'CHANGE_TICKET_PRICE',
  'CHANGE_DRAW_FORMULA',
]);

export interface AdminPrincipal {
  adminUserId: string;
  email: string;
  role: AdminRole;
}

export interface AdminPermissionDecision {
  allowed: boolean;
  reason?: string;
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return adminRolePermissions[role].includes(permission);
}

export function isAuditor(role: AdminRole): boolean {
  return role === 'AUDITOR';
}

export function isMutatingPermission(permission: AdminPermission): boolean {
  return mutatingAdminPermissions.has(permission);
}

export function canPerformAdminAction(role: AdminRole, action: AdminAction): boolean {
  return roleHasPermission(role, adminActionPermissions[action]);
}

export function evaluateAdminPermission(params: {
  principal: AdminPrincipal;
  action: AdminAction;
  initiatedByAdminUserId?: string | null;
}): AdminPermissionDecision {
  const permission = adminActionPermissions[params.action];

  if (!roleHasPermission(params.principal.role, permission)) {
    return {
      allowed: false,
      reason: `${params.principal.role} lacks ${permission}`,
    };
  }

  if (isAuditor(params.principal.role) && isMutatingPermission(permission)) {
    return {
      allowed: false,
      reason: 'Auditors are read-only and cannot create, edit, approve, reject, or initiate actions.',
    };
  }

  if (
    params.initiatedByAdminUserId &&
    params.initiatedByAdminUserId === params.principal.adminUserId &&
    selfApprovalBlockedActions.has(params.action)
  ) {
    return {
      allowed: false,
      reason: 'The same admin cannot initiate and approve the same sensitive action.',
    };
  }

  if (
    params.principal.role === 'INTERMEDIATE_ADMIN' &&
    intermediateInitiationBlockedActions.has(params.action)
  ) {
    return {
      allowed: false,
      reason: 'Intermediate Admin cannot perform final authorization actions.',
    };
  }

  return { allowed: true };
}
