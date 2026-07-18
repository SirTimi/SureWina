import type { ApiClient } from '../client.js';

export type AdminFunction =
  | 'OPERATOR'
  | 'COMPLIANCE_OFFICER'
  | 'FINANCE_OFFICER'
  | 'SUPPORT_AGENT';

export type AdminTier = 'BASIC' | 'INTERMEDIATE' | 'SUPER' | 'AUDITOR';

export interface AdminMe {
  adminUserId: string;
  email: string;
  fullName: string;
  role: AdminFunction;
  tier: AdminTier;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}

export interface AdminDashboard {
  asOf: string;
  today: {
    direct: { salesNgn: number; tickets: number; transactions: number };
    agent: { salesNgn: number; tickets: number; transactions: number };
    totalSalesNgn: number;
  };
  draws: Record<string, number>;
  claims: Record<string, number>;
  remittance: { outstandingNgn: number; openCount: number };
  commission: { pendingNgn: number; pendingCount: number };
  actionRequired: { kycPendingReview: number; activeDraws: number };
}

export interface AdminAgentRow {
  agentId: string;
  agentCode: string;
  fullName: string;
  phoneNumber: string;
  registeredStateCode: string;
  status: 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  commissionRate: string | number;
  createdAt: string;
}

export interface AdminCustomerDetail {
  phoneNumber: string;
  registered: boolean;
  displayName: string | null;
  kycStatus: string | null;
  blocked: boolean;
  blockReason: string | null;
  lifetime: {
    spendNgn: number;
    ticketsBought: number;
    transactions: number;
    ticketRows: number;
  };
  accumulation: { cumulativeCount: number; jackpotEntriesTotal: number } | null;
  claims: {
    claimId: string;
    winnerTicketRef: string;
    status: string;
    grossPrizeValueNgn: number;
    createdAt: string;
  }[];
}

export interface AdminClaimRow {
  claimId: string;
  winnerTicketRef: string;
  drawCode: string;
  prizeDescription: string;
  status: string;
  claimType: 'PRODUCT' | 'CASH' | null;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  selectionDeadlineAt: string;
  claimDeadlineAt: string;
  createdAt: string;
  winnerPhone: string;
  kycBvnVerifiedAt: string | null;
  hasIdDoc: boolean;
  hasSelfie: boolean;
  bankResolved: boolean;
}

export interface AdminReconciliation {
  from: string;
  to: string;
  rows: {
    gateway: string;
    status: string;
    amountNgn: number;
    tickets: number;
    transactions: number;
  }[];
}

export interface AdminRemittanceRow {
  remittanceId: string;
  agentCode: string;
  agentName: string;
  agentPhone: string;
  periodDate: string;
  grossSalesNgn: number;
  commissionNgn: number;
  amountDueNgn: number;
  ticketCount: number;
  status: 'PENDING' | 'AGENT_CONFIRMED' | 'RECEIVED' | 'LATE' | 'WRITTEN_OFF';
  bankTransferRef: string | null;
  agentConfirmedAt: string | null;
  receivedAt: string | null;
}
export class AdminModule {
  constructor(private readonly client: ApiClient) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; tokenType: string; expiresInSeconds: number; admin: AdminMe }> {
    return this.client.post(
      '/admin/auth/login',
      { email, password },
      { skipAuth: true },
    );
  }

  async getMe(): Promise<AdminMe> {
    return this.client.get('/admin/auth/me');
  }

  async dashboard(): Promise<AdminDashboard> {
    return this.client.get('/admin/dashboard');
  }

  async listAgents(params?: { status?: string }): Promise<{
    agents: AdminAgentRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.client.get('/admin/agents', {
      query: { status: params?.status },
    });
  }

  async agentDetail(agentId: string): Promise<Record<string, unknown>> {
    return this.client.get(`/admin/agents/${encodeURIComponent(agentId)}`);
  }

  async agentAction(
    agentId: string,
    action: 'approve' | 'suspend' | 'reactivate' | 'terminate',
    reason?: string,
  ): Promise<{ agentId: string; agentCode: string; status: string }> {
    return this.client.post(
      `/admin/agents/${encodeURIComponent(agentId)}/${action}`,
      reason ? { reason } : {},
    );
  }

  async customerDetail(phoneNumber: string): Promise<AdminCustomerDetail> {
    return this.client.get('/admin/customers/detail', { query: { phoneNumber } });
  }

  async blockCustomer(phoneNumber: string, reason: string): Promise<{ phoneNumber: string; blocked: boolean; reason: string }> {
    return this.client.post('/admin/customers/block', { phoneNumber, reason });
  }

  async unblockCustomer(phoneNumber: string): Promise<{ phoneNumber: string; blocked: boolean }> {
    return this.client.post('/admin/customers/unblock', { phoneNumber });
  }

  async listClaims(status?: string): Promise<{ claims: AdminClaimRow[] }> {
    return this.client.get('/admin/claims', { query: { status } });
  }

  async reviewClaimKyc(
    claimId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ): Promise<AdminClaimRow> {
    return this.client.post(`/admin/claims/${encodeURIComponent(claimId)}/kyc/review`, {
      decision,
      ...(note ? { note } : {}),
    });
  }

  async reconciliation(fromDate: string, toDate: string): Promise<AdminReconciliation> {
    return this.client.get('/admin/finance/reconciliation', {
      query: { fromDate, toDate },
    });
  }

  async refundPayment(txnId: string, reason: string): Promise<Record<string, unknown>> {
    return this.client.post(`/admin/finance/payments/${encodeURIComponent(txnId)}/refund`, { reason });
  }

  async retryCommission(disbId: string): Promise<Record<string, unknown>> {
    return this.client.post(`/admin/finance/commissions/${encodeURIComponent(disbId)}/retry`, {});
  }

  async markRemittanceReceived(remittanceId: string): Promise<Record<string, unknown>> {
    return this.client.post(
      `/admin/finance/remittances/${encodeURIComponent(remittanceId)}/mark-received`,
      {},
    );
  }

  async listRemittances(status?: string): Promise<{ remittances: AdminRemittanceRow[] }> {
    return this.client.get('/admin/finance/remittances', { query: { status } });
  }

}