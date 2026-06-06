import type { AdminRole } from '@/lib/admin-auth';

export type EscalationModule =
  | 'ADMINS'
  | 'AGENTS'
  | 'DRAWS'
  | 'WORKFLOWS'
  | 'PAYOUTS'
  | 'AUDIT'
  | 'CONFIG'
  | 'OTHER';

export type EscalationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EscalationStatus =
  | 'OPEN'
  | 'UNDER_MANAGEMENT_REVIEW'
  | 'RESOLVED'
  | 'DISMISSED';

export interface AuditorEscalation {
  escalationId: string;
  title: string;
  module: EscalationModule;
  relatedRecord: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  evidenceComment: string;
  raisedByName: string;
  raisedByRole: AdminRole;
  raisedAt: string;
  assignedTo: string;
  managementResponse: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export const auditorEscalations: AuditorEscalation[] = [
  {
    escalationId: 'esc_001',
    title: 'Possible self-approval pattern detected',
    module: 'WORKFLOWS',
    relatedRecord: 'Workflow · Agent onboarding final approval',
    severity: 'HIGH',
    status: 'OPEN',
    evidenceComment:
      'Audit review shows related approval activity should be reviewed for separation of duties.',
    raisedByName: 'Aisha Mohammed',
    raisedByRole: 'AUDITOR',
    raisedAt: hoursAgo(3),
    assignedTo: 'Management / Super Admin',
    managementResponse: null,
    respondedBy: null,
    respondedAt: null,
  },
  {
    escalationId: 'esc_002',
    title: 'Draw configuration change needs management review',
    module: 'DRAWS',
    relatedRecord: 'Draw schedule · Sure Bonanza',
    severity: 'MEDIUM',
    status: 'UNDER_MANAGEMENT_REVIEW',
    evidenceComment:
      'Cutoff and execution time were changed. Auditor requests confirmation that the change was approved before activation.',
    raisedByName: 'Aisha Mohammed',
    raisedByRole: 'AUDITOR',
    raisedAt: hoursAgo(8),
    assignedTo: 'Management / Super Admin',
    managementResponse:
      'Review started. Awaiting approval evidence from operations lead.',
    respondedBy: 'Tunde Adekunle',
    respondedAt: hoursAgo(2),
  },
  {
    escalationId: 'esc_003',
    title: 'Suspended admin account still appears in active review list',
    module: 'ADMINS',
    relatedRecord: 'Admin · Daniel Okorie',
    severity: 'CRITICAL',
    status: 'OPEN',
    evidenceComment:
      'Suspended admin should not appear in any active approval routing or operational assignment list.',
    raisedByName: 'Aisha Mohammed',
    raisedByRole: 'AUDITOR',
    raisedAt: hoursAgo(1),
    assignedTo: 'Management / Super Admin',
    managementResponse: null,
    respondedBy: null,
    respondedAt: null,
  },
  {
    escalationId: 'esc_004',
    title: 'Payout approval record reviewed',
    module: 'PAYOUTS',
    relatedRecord: 'Payout · CLAIM-20260502-001',
    severity: 'LOW',
    status: 'RESOLVED',
    evidenceComment:
      'Auditor requested management confirmation on payout approval trail.',
    raisedByName: 'Aisha Mohammed',
    raisedByRole: 'AUDITOR',
    raisedAt: hoursAgo(36),
    assignedTo: 'Management / Super Admin',
    managementResponse:
      'KYC evidence and approval trail confirmed. No exception found.',
    respondedBy: 'Tunde Adekunle',
    respondedAt: hoursAgo(30),
  },
];

export function listAuditorEscalations() {
  return auditorEscalations;
}

export function getAuditorEscalation(escalationId: string) {
  return (
    auditorEscalations.find(
      (escalation) => escalation.escalationId === escalationId,
    ) ?? null
  );
}

export function escalationModuleLabel(module: EscalationModule) {
  if (module === 'OTHER') return 'Other';

  return module
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function escalationStatusLabel(status: EscalationStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function escalationSeverityTone(
  severity: EscalationSeverity,
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (severity === 'LOW') return 'info';
  if (severity === 'MEDIUM') return 'warning';
  if (severity === 'HIGH') return 'danger';
  if (severity === 'CRITICAL') return 'danger';

  return 'neutral';
}

export function escalationStatusTone(
  status: EscalationStatus,
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'RESOLVED') return 'success';
  if (status === 'DISMISSED') return 'neutral';
  if (status === 'UNDER_MANAGEMENT_REVIEW') return 'warning';
  if (status === 'OPEN') return 'danger';

  return 'neutral';
}