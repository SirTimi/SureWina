import type { AdminRole } from '@/lib/admin-auth';
import {
  listWorkflowRequests,
  workflowStatusLabel,
  workflowTypeLabel,
  type WorkflowRequest,
} from '@/lib/workflow-mock';

export type NotificationType =
  | 'PENDING_APPROVAL'
  | 'ESCALATION'
  | 'OVERDUE_TASK'
  | 'FAILED_WORKFLOW'
  | 'WORKFLOW_STAGE_MOVED'
  | 'SYSTEM_NOTICE';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export interface AdminNotification {
  notificationId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  workflowId?: string;
  targetHref?: string;
  audienceRoles: AdminRole[];
  channels: NotificationChannel[];
  read: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'surewina_admin_notifications';

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function buildSeedNotifications(): AdminNotification[] {
  const workflows = listWorkflowRequests();

  const pendingWorkflowAlerts = workflows
    .filter(
      (workflow) =>
        workflow.status === 'PENDING_INTERMEDIATE_REVIEW' ||
        workflow.status === 'PENDING_SUPER_ADMIN_APPROVAL',
    )
    .map((workflow, index): AdminNotification => {
      const targetRole = workflow.requiredApproverRole ?? 'SUPER_ADMIN';

      return {
        notificationId: `seed_pending_${workflow.workflowId}`,
        type: 'PENDING_APPROVAL',
        severity:
          workflow.status === 'PENDING_SUPER_ADMIN_APPROVAL' ? 'WARNING' : 'INFO',
        title:
          workflow.status === 'PENDING_SUPER_ADMIN_APPROVAL'
            ? 'Super Admin approval required'
            : 'Intermediate review required',
        message: `${workflowTypeLabel(workflow.requestType)} needs action: ${workflow.targetRecordLabel}.`,
        workflowId: workflow.workflowId,
        targetHref: `/workflows/${workflow.workflowId}`,
        audienceRoles: [targetRole],
        channels: ['IN_APP', 'EMAIL'],
        read: false,
        createdAt: hoursAgo(index + 1),
      };
    });

  return [
    ...pendingWorkflowAlerts,
    {
      notificationId: 'seed_escalation_001',
      type: 'ESCALATION',
      severity: 'DANGER',
      title: 'Auditor escalation raised',
      message:
        'Internal Audit flagged a suspicious approval pattern for management review.',
      targetHref: '/audit-log',
      audienceRoles: ['SUPER_ADMIN'],
      channels: ['IN_APP', 'EMAIL'],
      read: false,
      createdAt: hoursAgo(2),
    },
    {
      notificationId: 'seed_overdue_001',
      type: 'OVERDUE_TASK',
      severity: 'WARNING',
      title: 'Approval task overdue',
      message:
        'A pending workflow has exceeded its expected review window.',
      targetHref: '/workflows',
      audienceRoles: ['INTERMEDIATE_ADMIN', 'SUPER_ADMIN'],
      channels: ['IN_APP', 'EMAIL'],
      read: false,
      createdAt: hoursAgo(5),
    },
    {
      notificationId: 'seed_failed_001',
      type: 'FAILED_WORKFLOW',
      severity: 'DANGER',
      title: 'Workflow failed',
      message:
        'A workflow could not proceed because required profile documents were incomplete.',
      targetHref: '/workflows',
      audienceRoles: ['INTERMEDIATE_ADMIN', 'SUPER_ADMIN', 'AUDITOR'],
      channels: ['IN_APP'],
      read: true,
      createdAt: hoursAgo(8),
    },
    {
      notificationId: 'seed_channels_001',
      type: 'SYSTEM_NOTICE',
      severity: 'INFO',
      title: 'Notification routing plan',
      message:
        'In-app notifications are active in this frontend phase. Email comes next, then SMS and WhatsApp.',
      targetHref: '/notifications',
      audienceRoles: ['BASIC_ADMIN', 'INTERMEDIATE_ADMIN', 'SUPER_ADMIN', 'AUDITOR'],
      channels: ['IN_APP'],
      read: false,
      createdAt: hoursAgo(12),
    },
  ];
}

function readStoredNotifications(): AdminNotification[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as AdminNotification[];
  } catch {
    return [];
  }
}

function writeStoredNotifications(notifications: AdminNotification[]) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  window.dispatchEvent(new Event('surewina:notifications-changed'));
}

export function listNotifications(role?: AdminRole): AdminNotification[] {
  const merged = [...readStoredNotifications(), ...buildSeedNotifications()];

  const unique = new Map<string, AdminNotification>();
  for (const notification of merged) {
    unique.set(notification.notificationId, notification);
  }

  const notifications = Array.from(unique.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (!role) return notifications;

  return notifications.filter((notification) =>
    notification.audienceRoles.includes(role),
  );
}

export function getUnreadNotificationCount(role: AdminRole): number {
  return listNotifications(role).filter((notification) => !notification.read).length;
}

export function markNotificationRead(notificationId: string) {
  const stored = readStoredNotifications();
  const seed = buildSeedNotifications();

  const all = [...stored, ...seed].map((notification) =>
    notification.notificationId === notificationId
      ? { ...notification, read: true }
      : notification,
  );

  writeStoredNotifications(all);
}

export function markAllNotificationsRead(role: AdminRole) {
  const all = listNotifications().map((notification) =>
    notification.audienceRoles.includes(role)
      ? { ...notification, read: true }
      : notification,
  );

  writeStoredNotifications(all);
}

export function createNotification(input: Omit<AdminNotification, 'notificationId' | 'createdAt'>) {
  const notification: AdminNotification = {
    ...input,
    notificationId: `ntf_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  };

  writeStoredNotifications([notification, ...readStoredNotifications()]);

  return notification;
}

export function createWorkflowStageNotification(params: {
  workflow: WorkflowRequest;
  action: 'APPROVED' | 'REJECTED';
  actorName: string;
  actorRole: AdminRole;
  nextRequiredRole: AdminRole | null;
}) {
  const isApproved = params.action === 'APPROVED';

  const audienceRoles: AdminRole[] = isApproved
    ? params.nextRequiredRole
      ? [params.nextRequiredRole]
      : ['SUPER_ADMIN']
    : ['SUPER_ADMIN', 'AUDITOR'];

  return createNotification({
    type: isApproved ? 'WORKFLOW_STAGE_MOVED' : 'FAILED_WORKFLOW',
    severity: isApproved ? 'SUCCESS' : 'DANGER',
    title: isApproved ? 'Workflow moved to next stage' : 'Workflow rejected',
    message: isApproved
      ? `${params.actorName} approved ${workflowTypeLabel(params.workflow.requestType)}. Current status: ${workflowStatusLabel(params.workflow.status)}.`
      : `${params.actorName} rejected ${workflowTypeLabel(params.workflow.requestType)} for ${params.workflow.targetRecordLabel}.`,
    workflowId: params.workflow.workflowId,
    targetHref: `/workflows/${params.workflow.workflowId}`,
    audienceRoles,
    channels: ['IN_APP', 'EMAIL'],
    read: false,
  });
}

export function notificationTypeLabel(type: NotificationType) {
  switch (type) {
    case 'PENDING_APPROVAL':
      return 'Pending approval';
    case 'ESCALATION':
      return 'Escalation';
    case 'OVERDUE_TASK':
      return 'Overdue task';
    case 'FAILED_WORKFLOW':
      return 'Failed workflow';
    case 'WORKFLOW_STAGE_MOVED':
      return 'Workflow stage moved';
    case 'SYSTEM_NOTICE':
      return 'System notice';
  }
}

export function notificationSeverityTone(
  severity: NotificationSeverity,
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (severity === 'SUCCESS') return 'success';
  if (severity === 'WARNING') return 'warning';
  if (severity === 'DANGER') return 'danger';
  if (severity === 'INFO') return 'info';
  return 'neutral';
}