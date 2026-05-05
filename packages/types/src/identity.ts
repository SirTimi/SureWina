import type { Timestamp, UUID, PhoneE164, StateCode } from './common.js';

export type UserKycStatus = 'NONE' | 'OTP_VERIFIED' | 'TIER1_COMPLETE';

export interface User {
  userId: UUID;
  phoneNumber: PhoneE164;
  email: string | null;
  displayName: string | null;
  kycStatus: UserKycStatus;
  loyaltyPointsBalance: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPublic {
  userId: UUID;
  displayName: string | null;
  kycStatus: UserKycStatus;
}

/**
 * Full user view returned by /me — includes phone, email, settings.
 * Only the user's own client should ever see this.
 */
export interface UserMe {
  userId: UUID;
  phoneNumber: PhoneE164;
  email: string | null;
  displayName: string | null;
  kycStatus: UserKycStatus;
  loyaltyPointsBalance: number;
  notificationPreferences: {
    sms: boolean;
    push: boolean;
    email: boolean;
  };
  bankAccount: {
    bankName: string;
    accountNumber: string; // last 4 only
    accountName: string;
  } | null;
  spendLimit: {
    period: 'WEEKLY' | 'MONTHLY';
    capNgn: number;
  } | null;
  selfExclusionUntil: Timestamp | null;
  createdAt: Timestamp;
}

export type AgentTier = 'BRONZE' | 'SILVER' | 'GOLD';
export type AgentStatus = 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Agent {
  agentId: UUID;
  agentCode: string;
  phoneNumber: PhoneE164;
  email: string | null;
  fullName: string;
  registeredStateCode: StateCode;
  status: AgentStatus;
  tier: AgentTier;
  commissionRate: number;
  isSuperAgent: boolean;
  superAgentCode: string | null;
  overrideCommissionRate: number | null;
  bvnHash: string;
  trainingCompletedAt: Timestamp | null;
  agentAgreementSignedAt: Timestamp | null;
  monthlyTicketCount: number;
  graceperiodUsedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AgentPublic {
  agentCode: string;
  registeredStateCode: StateCode;
  tier: AgentTier;
}

export type AdminRole =
  | 'OPERATOR'
  | 'COMPLIANCE_OFFICER'
  | 'FINANCE_OFFICER'
  | 'SUPPORT_AGENT';

export interface AdminUser {
  adminUserId: UUID;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Timestamp | null;
  createdAt: Timestamp;
}