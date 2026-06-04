import type { AdminRole } from '@/lib/admin-auth';
import { roleLabel } from '@/lib/admin-auth';

export type AdminAccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type AdminClearanceLevel = 'LEVEL_1_BASIC' | 'LEVEL_2_INTERMEDIATE' | 'LEVEL_3_SUPER' | 'READ_ONLY_AUDIT';

export interface AdminManagementUser {
  adminUserId: string;
  fullName: string;
  email: string;
  phoneE164: string;
  role: AdminRole;
  clearanceLevel: AdminClearanceLevel;
  department: string;
  functionScope: string;
  status: AdminAccountStatus;
  mfaEnabled: boolean;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  lastLoginAt: string | null;
  notes: string;
}

export interface AdminCreationDraft {
  fullName: string;
  email: string;
  phoneE164: string;
  role: AdminRole;
  department: string;
  functionScope: string;
  requestedBy: string;
}

function isoDays(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

export const adminManagementUsers: AdminManagementUser[] = [
  {
    adminUserId: 'adm_super_001',
    fullName: 'Tunde Adekunle',
    email: 'super.admin@surewina.ng',
    phoneE164: '+2348010010001',
    role: 'SUPER_ADMIN',
    clearanceLevel: 'LEVEL_3_SUPER',
    department: 'Executive Operations',
    functionScope: 'Final approvals, admin authorization, system controls',
    status: 'ACTIVE',
    mfaEnabled: true,
    createdBy: 'Board authorization',
    createdAt: isoDays(180),
    approvedBy: 'Board authorization',
    approvedAt: isoDays(180),
    lastLoginAt: isoDays(0),
    notes: 'Primary super admin profile for final authorization and admin management.',
  },
  {
    adminUserId: 'adm_basic_001',
    fullName: 'Sade Bello',
    email: 'basic.admin@surewina.ng',
    phoneE164: '+2348010010002',
    role: 'BASIC_ADMIN',
    clearanceLevel: 'LEVEL_1_BASIC',
    department: 'Customer Operations',
    functionScope: 'Enquiries, ticket status checks, customer status checks, agent profiling initiation',
    status: 'ACTIVE',
    mfaEnabled: true,
    createdBy: 'Tunde Adekunle',
    createdAt: isoDays(90),
    approvedBy: 'Tunde Adekunle',
    approvedAt: isoDays(89),
    lastLoginAt: isoDays(1),
    notes: 'Can initiate lower-level operational records but cannot approve sensitive actions.',
  },
  {
    adminUserId: 'adm_intermediate_001',
    fullName: 'Ifeanyi Okafor',
    email: 'intermediate.admin@surewina.ng',
    phoneE164: '+2348010010003',
    role: 'INTERMEDIATE_ADMIN',
    clearanceLevel: 'LEVEL_2_INTERMEDIATE',
    department: 'Operations Review',
    functionScope: 'First-level reviews, onboarding checks, payout checks, draw setup initiation',
    status: 'ACTIVE',
    mfaEnabled: true,
    createdBy: 'Tunde Adekunle',
    createdAt: isoDays(75),
    approvedBy: 'Tunde Adekunle',
    approvedAt: isoDays(74),
    lastLoginAt: isoDays(2),
    notes: 'Can carry out first-level review. Cannot approve actions initiated by self.',
  },
  {
    adminUserId: 'adm_auditor_001',
    fullName: 'Aisha Mohammed',
    email: 'auditor@surewina.ng',
    phoneE164: '+2348010010004',
    role: 'AUDITOR',
    clearanceLevel: 'READ_ONLY_AUDIT',
    department: 'Internal Audit',
    functionScope: 'Read-only query access across operational layers and management escalation',
    status: 'ACTIVE',
    mfaEnabled: true,
    createdBy: 'Tunde Adekunle',
    createdAt: isoDays(45),
    approvedBy: 'Tunde Adekunle',
    approvedAt: isoDays(44),
    lastLoginAt: isoDays(3),
    notes: 'Auditor can query records but cannot create, edit, approve, reject, or initiate changes.',
  },
  {
    adminUserId: 'adm_pending_001',
    fullName: 'Maryam Yusuf',
    email: 'maryam.yusuf@surewina.ng',
    phoneE164: '+2348010010005',
    role: 'BASIC_ADMIN',
    clearanceLevel: 'LEVEL_1_BASIC',
    department: 'Agent Support',
    functionScope: 'Agent status checks and agent profiling initiation',
    status: 'PENDING',
    mfaEnabled: false,
    createdBy: 'Tunde Adekunle',
    createdAt: isoDays(1),
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    notes: 'Awaiting Super Admin authorization before account activation.',
  },
  {
    adminUserId: 'adm_suspended_001',
    fullName: 'Daniel Okorie',
    email: 'daniel.okorie@surewina.ng',
    phoneE164: '+2348010010006',
    role: 'INTERMEDIATE_ADMIN',
    clearanceLevel: 'LEVEL_2_INTERMEDIATE',
    department: 'Finance Review',
    functionScope: 'First-level payout review',
    status: 'SUSPENDED',
    mfaEnabled: true,
    createdBy: 'Tunde Adekunle',
    createdAt: isoDays(120),
    approvedBy: 'Tunde Adekunle',
    approvedAt: isoDays(119),
    lastLoginAt: isoDays(16),
    notes: 'Suspended pending access review. No portal access should be granted while suspended.',
  },
];

export const adminRoleOptions: Array<{
  role: AdminRole;
  label: string;
  clearanceLevel: AdminClearanceLevel;
  description: string;
}> = [
  {
    role: 'BASIC_ADMIN',
    label: roleLabel('BASIC_ADMIN'),
    clearanceLevel: 'LEVEL_1_BASIC',
    description: 'Enquiries, ticket/customer status, agent profiling initiation. No approval rights.',
  },
  {
    role: 'INTERMEDIATE_ADMIN',
    label: roleLabel('INTERMEDIATE_ADMIN'),
    clearanceLevel: 'LEVEL_2_INTERMEDIATE',
    description: 'First-level review and operational checks. Cannot approve own initiated actions.',
  },
  {
    role: 'AUDITOR',
    label: roleLabel('AUDITOR'),
    clearanceLevel: 'READ_ONLY_AUDIT',
    description: 'Read-only query access across layers. No mutation or approval rights.',
  },
  {
    role: 'SUPER_ADMIN',
    label: roleLabel('SUPER_ADMIN'),
    clearanceLevel: 'LEVEL_3_SUPER',
    description: 'Final approvals, admin authorization, system controls. Assign sparingly.',
  },
];

export function listAdminManagementUsers(): AdminManagementUser[] {
  return adminManagementUsers;
}

export function listPendingAdminUsers(): AdminManagementUser[] {
  return adminManagementUsers.filter((user) => user.status === 'PENDING');
}

export function getAdminManagementUser(id: string): AdminManagementUser | null {
  return adminManagementUsers.find((user) => user.adminUserId === id) ?? null;
}

export function buildPendingAdminPreview(draft: AdminCreationDraft): AdminManagementUser {
  const roleConfig = adminRoleOptions.find((option) => option.role === draft.role) ?? adminRoleOptions[0];

  return {
    adminUserId: `adm_pending_${Date.now()}`,
    fullName: draft.fullName,
    email: draft.email,
    phoneE164: draft.phoneE164,
    role: draft.role,
    clearanceLevel: roleConfig.clearanceLevel,
    department: draft.department,
    functionScope: draft.functionScope,
    status: 'PENDING',
    mfaEnabled: false,
    createdBy: draft.requestedBy,
    createdAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
    lastLoginAt: null,
    notes: 'Pending authorization. Account remains inactive until approved by Super Admin.',
  };
}

export function statusTone(status: AdminAccountStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}

export function clearanceLabel(level: AdminClearanceLevel): string {
  switch (level) {
    case 'LEVEL_1_BASIC':
      return 'Level 1 · Basic';
    case 'LEVEL_2_INTERMEDIATE':
      return 'Level 2 · Intermediate';
    case 'LEVEL_3_SUPER':
      return 'Level 3 · Super';
    case 'READ_ONLY_AUDIT':
      return 'Read-only audit';
  }
}
