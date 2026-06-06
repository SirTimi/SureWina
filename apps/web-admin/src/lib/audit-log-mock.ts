import type { AdminRole } from '@/lib/admin-auth';

export type AuditModule =
  | 'ADMINS'
  | 'AGENTS'
  | 'DRAWS'
  | 'WORKFLOWS'
  | 'PAYOUTS'
  | 'CONFIG'
  | 'AUTH'
  | 'AUDIT'
  | 'REPORTS';

export type AuditAction =
  | 'ADMIN_CREATED'
  | 'ADMIN_APPROVED'
  | 'ADMIN_REJECTED'
  | 'ADMIN_SUSPENDED'
  | 'ADMIN_REVOKED'
  | 'ROLE_CHANGED'
  | 'AGENT_PROFILED'
  | 'AGENT_APPROVED'
  | 'DRAW_CREATED'
  | 'DRAW_CONFIG_CHANGED'
  | 'TICKET_PRICE_CHANGED'
  | 'PAYOUT_APPROVED'
  | 'WORKFLOW_APPROVED'
  | 'WORKFLOW_REJECTED'
  | 'LOGIN'
  | 'VIEWED_AUDIT_LOG'
  | 'CONFIG_CHANGE_REQUESTED';

export type AuditSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export interface AuditLogEntry {
  auditId: string;
  module: AuditModule;
  action: AuditAction;
  actorName: string;
  actorEmail: string;
  actorRole: AdminRole;
  target: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  ipAddress: string;
  device: string;
  createdAt: string;
  severity: AuditSeverity;
}

const STORAGE_KEY = 'surewina_admin_audit_log';

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const seedAuditLogs: AuditLogEntry[] = [
  {
    auditId: 'audit_admin_created_001',
    module: 'ADMINS',
    action: 'ADMIN_CREATED',
    actorName: 'Tunde Adekunle',
    actorEmail: 'super.admin@surewina.ng',
    actorRole: 'SUPER_ADMIN',
    target: 'Admin · Maryam Yusuf',
    oldValue: null,
    newValue: 'Pending Basic Admin profile created',
    reason: 'New admin needed for Agent Support desk',
    ipAddress: '102.89.44.21',
    device: 'Chrome · Windows',
    createdAt: hoursAgo(2),
    severity: 'INFO',
  },
  {
    auditId: 'audit_admin_approved_001',
    module: 'ADMINS',
    action: 'ADMIN_APPROVED',
    actorName: 'Tunde Adekunle',
    actorEmail: 'super.admin@surewina.ng',
    actorRole: 'SUPER_ADMIN',
    target: 'Admin · Sade Bello',
    oldValue: 'PENDING',
    newValue: 'ACTIVE',
    reason: 'Profile reviewed and authorized',
    ipAddress: '102.89.44.21',
    device: 'Chrome · Windows',
    createdAt: hoursAgo(7),
    severity: 'SUCCESS',
  },
  {
    auditId: 'audit_agent_profiled_001',
    module: 'AGENTS',
    action: 'AGENT_PROFILED',
    actorName: 'Sade Bello',
    actorEmail: 'basic.admin@surewina.ng',
    actorRole: 'BASIC_ADMIN',
    target: 'Agent · Musa Ibrahim',
    oldValue: null,
    newValue: 'Agent onboarding profile submitted',
    reason: 'Agent registration request received',
    ipAddress: '102.88.12.90',
    device: 'Edge · Windows',
    createdAt: hoursAgo(5),
    severity: 'INFO',
  },
  {
    auditId: 'audit_agent_approved_001',
    module: 'AGENTS',
    action: 'AGENT_APPROVED',
    actorName: 'Ifeanyi Okafor',
    actorEmail: 'intermediate.admin@surewina.ng',
    actorRole: 'INTERMEDIATE_ADMIN',
    target: 'Agent · Chika Nwosu',
    oldValue: 'PENDING_REVIEW',
    newValue: 'PENDING_SUPER_ADMIN_APPROVAL',
    reason: 'KYC and profile documents reviewed',
    ipAddress: '197.210.55.10',
    device: 'Chrome · macOS',
    createdAt: hoursAgo(4),
    severity: 'SUCCESS',
  },
  {
    auditId: 'audit_draw_config_001',
    module: 'DRAWS',
    action: 'DRAW_CONFIG_CHANGED',
    actorName: 'Ifeanyi Okafor',
    actorEmail: 'intermediate.admin@surewina.ng',
    actorRole: 'INTERMEDIATE_ADMIN',
    target: 'Draw schedule · Sure Bonanza',
    oldValue: 'Cutoff 18:30 · Execution 19:30',
    newValue: 'Cutoff 19:00 · Execution 20:00',
    reason: 'Align cutoff to one hour before execution',
    ipAddress: '197.210.55.10',
    device: 'Chrome · macOS',
    createdAt: hoursAgo(10),
    severity: 'WARNING',
  },
  {
    auditId: 'audit_ticket_price_001',
    module: 'DRAWS',
    action: 'TICKET_PRICE_CHANGED',
    actorName: 'Tunde Adekunle',
    actorEmail: 'super.admin@surewina.ng',
    actorRole: 'SUPER_ADMIN',
    target: 'Ticket price · Direct Sure Jackpot',
    oldValue: '₦5,000 active version',
    newValue: 'New version pending approval',
    reason: 'Price version review',
    ipAddress: '102.89.44.21',
    device: 'Chrome · Windows',
    createdAt: hoursAgo(16),
    severity: 'WARNING',
  },
  {
    auditId: 'audit_workflow_approved_001',
    module: 'WORKFLOWS',
    action: 'WORKFLOW_APPROVED',
    actorName: 'Ifeanyi Okafor',
    actorEmail: 'intermediate.admin@surewina.ng',
    actorRole: 'INTERMEDIATE_ADMIN',
    target: 'Workflow · Agent onboarding final approval',
    oldValue: 'INTERMEDIATE_REVIEW',
    newValue: 'SUPER_ADMIN_APPROVAL',
    reason: 'First-level review completed',
    ipAddress: '197.210.55.10',
    device: 'Chrome · macOS',
    createdAt: hoursAgo(6),
    severity: 'SUCCESS',
  },
  {
    auditId: 'audit_workflow_rejected_001',
    module: 'WORKFLOWS',
    action: 'WORKFLOW_REJECTED',
    actorName: 'Ifeanyi Okafor',
    actorEmail: 'intermediate.admin@surewina.ng',
    actorRole: 'INTERMEDIATE_ADMIN',
    target: 'Workflow · Rejected agent onboarding',
    oldValue: 'INTERMEDIATE_REVIEW',
    newValue: 'REJECTED',
    reason: 'Uploaded ID document did not match profile name',
    ipAddress: '197.210.55.10',
    device: 'Chrome · macOS',
    createdAt: hoursAgo(28),
    severity: 'DANGER',
  },
  {
    auditId: 'audit_payout_001',
    module: 'PAYOUTS',
    action: 'PAYOUT_APPROVED',
    actorName: 'Tunde Adekunle',
    actorEmail: 'super.admin@surewina.ng',
    actorRole: 'SUPER_ADMIN',
    target: 'Payout · CLAIM-20260502-001',
    oldValue: 'PENDING_APPROVAL',
    newValue: 'APPROVED',
    reason: 'Winner KYC verified',
    ipAddress: '102.89.44.21',
    device: 'Chrome · Windows',
    createdAt: hoursAgo(30),
    severity: 'SUCCESS',
  },
];

function readStoredAuditLogs(): AuditLogEntry[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as AuditLogEntry[];
  } catch {
    return [];
  }
}

function writeStoredAuditLogs(entries: AuditLogEntry[]) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event('surewina:audit-log-changed'));
}

export function listAuditLogs(): AuditLogEntry[] {
  const merged = [...readStoredAuditLogs(), ...seedAuditLogs];

  const unique = new Map<string, AuditLogEntry>();
  for (const entry of merged) unique.set(entry.auditId, entry);

  return Array.from(unique.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function createAuditLogEntry(input: Omit<AuditLogEntry, 'auditId' | 'createdAt' | 'ipAddress' | 'device'>) {
  const entry: AuditLogEntry = {
    ...input,
    auditId: `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ipAddress: 'Frontend mock',
    device: getDeviceLabel(),
  };

  writeStoredAuditLogs([entry, ...readStoredAuditLogs()]);
  return entry;
}

export function auditActionLabel(action: AuditAction) {
  return action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function auditModuleLabel(module: AuditModule) {
  return module.charAt(0) + module.slice(1).toLowerCase();
}

export function auditSeverityTone(
  severity: AuditSeverity,
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (severity === 'SUCCESS') return 'success';
  if (severity === 'WARNING') return 'warning';
  if (severity === 'DANGER') return 'danger';
  if (severity === 'INFO') return 'info';
  return 'neutral';
}

function getDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Unknown device';

  const ua = navigator.userAgent;

  if (ua.includes('Windows')) return 'Browser · Windows';
  if (ua.includes('Mac')) return 'Browser · macOS';
  if (ua.includes('Android')) return 'Browser · Android';
  if (ua.includes('iPhone')) return 'Browser · iPhone';

  return 'Browser';
}