import type { AdminRole } from '@/lib/admin-auth';

export type WorkflowRequestType =
  | 'AGENT_ONBOARDING'
  | 'DRAW_SETUP'
  | 'ADMIN_PROFILE'
  | 'PAYOUT_APPROVAL'
  | 'TICKET_PRICE_CHANGE'
  | 'DRAW_FORMULA_CHANGE';

export type WorkflowStatus =
  | 'PENDING_INTERMEDIATE_REVIEW'
  | 'PENDING_SUPER_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type WorkflowStage =
  | 'INITIATED'
  | 'INTERMEDIATE_REVIEW'
  | 'SUPER_ADMIN_APPROVAL'
  | 'COMPLETED'
  | 'REJECTED';

export interface WorkflowApprovalHistoryItem {
  id: string;
  stage: WorkflowStage;
  actorName: string;
  actorRole: AdminRole;
  action: 'INITIATED' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
  comment: string;
  createdAt: string;
}

export interface WorkflowRequest {
  workflowId: string;
  requestType: WorkflowRequestType;
  title: string;
  description: string;
  initiatorName: string;
  initiatorRole: AdminRole;
  initiatedByAdminUserId: string;
  currentStage: WorkflowStage;
  requiredApproverRole: AdminRole | null;
  status: WorkflowStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  targetRecordLabel: string;
  approvalHistory: WorkflowApprovalHistoryItem[];
}

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

export const workflowRequests: WorkflowRequest[] = [
  {
    workflowId: 'wf_agent_001',
    requestType: 'AGENT_ONBOARDING',
    title: 'Agent onboarding request',
    description:
      'Basic Admin initiated agent onboarding. Intermediate Admin must review before Super Admin final approval.',
    initiatorName: 'Sade Bello',
    initiatorRole: 'BASIC_ADMIN',
    initiatedByAdminUserId: 'adm_basic_001',
    currentStage: 'INTERMEDIATE_REVIEW',
    requiredApproverRole: 'INTERMEDIATE_ADMIN',
    status: 'PENDING_INTERMEDIATE_REVIEW',
    rejectionReason: null,
    createdAt: daysAgo(0, 4),
    updatedAt: daysAgo(0, 2),
    targetRecordLabel: 'Agent · Musa Ibrahim · +2348011122233',
    approvalHistory: [
      {
        id: 'hist_agent_001_1',
        stage: 'INITIATED',
        actorName: 'Sade Bello',
        actorRole: 'BASIC_ADMIN',
        action: 'INITIATED',
        comment: 'Agent profile submitted for review.',
        createdAt: daysAgo(0, 4),
      },
    ],
  },
  {
    workflowId: 'wf_agent_002',
    requestType: 'AGENT_ONBOARDING',
    title: 'Agent onboarding final approval',
    description:
      'Intermediate Admin has reviewed this agent. Super Admin approval activates the agent.',
    initiatorName: 'Sade Bello',
    initiatorRole: 'BASIC_ADMIN',
    initiatedByAdminUserId: 'adm_basic_001',
    currentStage: 'SUPER_ADMIN_APPROVAL',
    requiredApproverRole: 'SUPER_ADMIN',
    status: 'PENDING_SUPER_ADMIN_APPROVAL',
    rejectionReason: null,
    createdAt: daysAgo(1, 3),
    updatedAt: daysAgo(0, 5),
    targetRecordLabel: 'Agent · Chika Nwosu · +2348023344556',
    approvalHistory: [
      {
        id: 'hist_agent_002_1',
        stage: 'INITIATED',
        actorName: 'Sade Bello',
        actorRole: 'BASIC_ADMIN',
        action: 'INITIATED',
        comment: 'Agent profile submitted for review.',
        createdAt: daysAgo(1, 3),
      },
      {
        id: 'hist_agent_002_2',
        stage: 'INTERMEDIATE_REVIEW',
        actorName: 'Ifeanyi Okafor',
        actorRole: 'INTERMEDIATE_ADMIN',
        action: 'APPROVED',
        comment: 'KYC and agent details reviewed. Escalated for final approval.',
        createdAt: daysAgo(0, 5),
      },
    ],
  },
  {
    workflowId: 'wf_draw_001',
    requestType: 'DRAW_SETUP',
    title: 'Draw setup request',
    description:
      'Intermediate Admin created a new draw setup request. Super Admin must approve before publishing.',
    initiatorName: 'Ifeanyi Okafor',
    initiatorRole: 'INTERMEDIATE_ADMIN',
    initiatedByAdminUserId: 'adm_intermediate_001',
    currentStage: 'SUPER_ADMIN_APPROVAL',
    requiredApproverRole: 'SUPER_ADMIN',
    status: 'PENDING_SUPER_ADMIN_APPROVAL',
    rejectionReason: null,
    createdAt: daysAgo(0, 6),
    updatedAt: daysAgo(0, 6),
    targetRecordLabel: 'Draw · Sure Bonanza · Daily draw',
    approvalHistory: [
      {
        id: 'hist_draw_001_1',
        stage: 'INITIATED',
        actorName: 'Ifeanyi Okafor',
        actorRole: 'INTERMEDIATE_ADMIN',
        action: 'INITIATED',
        comment: 'Draw setup request created for final approval.',
        createdAt: daysAgo(0, 6),
      },
    ],
  },
  {
    workflowId: 'wf_price_001',
    requestType: 'TICKET_PRICE_CHANGE',
    title: 'Ticket price change request',
    description:
      'Ticket price/configuration changes require Super Admin final approval before going live.',
    initiatorName: 'Ifeanyi Okafor',
    initiatorRole: 'INTERMEDIATE_ADMIN',
    initiatedByAdminUserId: 'adm_intermediate_001',
    currentStage: 'SUPER_ADMIN_APPROVAL',
    requiredApproverRole: 'SUPER_ADMIN',
    status: 'PENDING_SUPER_ADMIN_APPROVAL',
    rejectionReason: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    targetRecordLabel: 'Config · Regular ticket price rule',
    approvalHistory: [
      {
        id: 'hist_price_001_1',
        stage: 'INITIATED',
        actorName: 'Ifeanyi Okafor',
        actorRole: 'INTERMEDIATE_ADMIN',
        action: 'INITIATED',
        comment: 'Ticket price change request created.',
        createdAt: daysAgo(2),
      },
    ],
  },
  {
    workflowId: 'wf_admin_001',
    requestType: 'ADMIN_PROFILE',
    title: 'Admin profile authorization',
    description:
      'New admin account is pending Super Admin approval before login access becomes active.',
    initiatorName: 'Tunde Adekunle',
    initiatorRole: 'SUPER_ADMIN',
    initiatedByAdminUserId: 'adm_super_001',
    currentStage: 'SUPER_ADMIN_APPROVAL',
    requiredApproverRole: 'SUPER_ADMIN',
    status: 'PENDING_SUPER_ADMIN_APPROVAL',
    rejectionReason: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    targetRecordLabel: 'Admin · Maryam Yusuf · Basic Admin',
    approvalHistory: [
      {
        id: 'hist_admin_001_1',
        stage: 'INITIATED',
        actorName: 'Tunde Adekunle',
        actorRole: 'SUPER_ADMIN',
        action: 'INITIATED',
        comment: 'Admin profile created and queued for authorization.',
        createdAt: daysAgo(1),
      },
    ],
  },
  {
    workflowId: 'wf_agent_003',
    requestType: 'AGENT_ONBOARDING',
    title: 'Rejected agent onboarding',
    description:
      'Agent onboarding request was rejected due to incomplete documentation.',
    initiatorName: 'Sade Bello',
    initiatorRole: 'BASIC_ADMIN',
    initiatedByAdminUserId: 'adm_basic_001',
    currentStage: 'REJECTED',
    requiredApproverRole: null,
    status: 'REJECTED',
    rejectionReason: 'Uploaded ID document did not match the agent profile name.',
    createdAt: daysAgo(3),
    updatedAt: daysAgo(2),
    targetRecordLabel: 'Agent · Daniel Eze · +2348099988877',
    approvalHistory: [
      {
        id: 'hist_agent_003_1',
        stage: 'INITIATED',
        actorName: 'Sade Bello',
        actorRole: 'BASIC_ADMIN',
        action: 'INITIATED',
        comment: 'Agent profile submitted for review.',
        createdAt: daysAgo(3),
      },
      {
        id: 'hist_agent_003_2',
        stage: 'INTERMEDIATE_REVIEW',
        actorName: 'Ifeanyi Okafor',
        actorRole: 'INTERMEDIATE_ADMIN',
        action: 'REJECTED',
        comment: 'Uploaded ID document did not match the agent profile name.',
        createdAt: daysAgo(2),
      },
    ],
  },
];

export function listWorkflowRequests() {
  return workflowRequests;
}

export function listPendingWorkflowRequests() {
  return workflowRequests.filter((workflow) =>
    workflow.status === 'PENDING_INTERMEDIATE_REVIEW' ||
    workflow.status === 'PENDING_SUPER_ADMIN_APPROVAL',
  );
}

export function getWorkflowRequest(workflowId: string) {
  return workflowRequests.find((workflow) => workflow.workflowId === workflowId) ?? null;
}

export function getNextWorkflowPreview(workflow: WorkflowRequest) {
  if (workflow.status === 'PENDING_INTERMEDIATE_REVIEW') {
    return {
      nextStage: 'SUPER_ADMIN_APPROVAL' as WorkflowStage,
      nextStatus: 'PENDING_SUPER_ADMIN_APPROVAL' as WorkflowStatus,
      nextRequiredRole: 'SUPER_ADMIN' as AdminRole,
      message: 'Approval will move this request to Super Admin final authorization.',
    };
  }

  if (workflow.status === 'PENDING_SUPER_ADMIN_APPROVAL') {
    return {
      nextStage: 'COMPLETED' as WorkflowStage,
      nextStatus: 'APPROVED' as WorkflowStatus,
      nextRequiredRole: null,
      message: 'Approval will complete this workflow and activate the requested change.',
    };
  }

  return {
    nextStage: workflow.currentStage,
    nextStatus: workflow.status,
    nextRequiredRole: workflow.requiredApproverRole,
    message: 'No next stage available for this workflow.',
  };
}

export function workflowTypeLabel(type: WorkflowRequestType) {
  switch (type) {
    case 'AGENT_ONBOARDING':
      return 'Agent onboarding';
    case 'DRAW_SETUP':
      return 'Draw setup';
    case 'ADMIN_PROFILE':
      return 'Admin profile';
    case 'PAYOUT_APPROVAL':
      return 'Payout approval';
    case 'TICKET_PRICE_CHANGE':
      return 'Ticket price change';
    case 'DRAW_FORMULA_CHANGE':
      return 'Draw formula change';
  }
}

export function workflowStatusLabel(status: WorkflowStatus) {
  switch (status) {
    case 'PENDING_INTERMEDIATE_REVIEW':
      return 'Pending intermediate review';
    case 'PENDING_SUPER_ADMIN_APPROVAL':
      return 'Pending Super Admin approval';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function workflowStageLabel(stage: WorkflowStage) {
  switch (stage) {
    case 'INITIATED':
      return 'Initiated';
    case 'INTERMEDIATE_REVIEW':
      return 'Intermediate review';
    case 'SUPER_ADMIN_APPROVAL':
      return 'Super Admin approval';
    case 'COMPLETED':
      return 'Completed';
    case 'REJECTED':
      return 'Rejected';
  }
}

export function workflowStatusTone(
  status: WorkflowStatus,
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger';
  if (status === 'PENDING_SUPER_ADMIN_APPROVAL') return 'warning';
  if (status === 'PENDING_INTERMEDIATE_REVIEW') return 'info';
  return 'neutral';
}