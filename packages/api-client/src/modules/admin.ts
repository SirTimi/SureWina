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

export interface AdminDrawRow {
  drawId: string;
  drawCode: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  prizeDescription: string;
  prizeValueNgn: number;
  ticketPriceNgn: number;
  ticketQuota: number | null;
  ticketsSold: number;
  scheduledAt: string;
  cutoffAt: string;
  status: string;
  seedCommittedHash: string | null;
  createdAt: string;
}

export interface AdminDrawDetail {
  draw: {
    drawId: string;
    drawCode: string;
    drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
    prizeDescription: string;
    prizeValueNgn: number;
    prizeImageUrl: string | null;
    ticketPriceNgn: number;
    ticketQuota: number | null;
    scheduledAt: string;
    cutoffAt: string;
    status: string;
    createdAt: string;
  };
  sales: { ticketsSold: number; grossSalesNgn: number; agentTickets: number };
  seed: { seedHash: string; committedAt: string | null; revealed: boolean } | null;
  result: {
    winnerTicketRef: string;
    executedAt: string;
    rngSeed: string;
    rngSeedHash: string;
    merkleRoot: string;
    engineVersion: string;
    engineSignature: string;
    totalTicketsSold: number;
    totalEligibleParticipants: number;
    zeroInterventionConfirmed: boolean;
    stateBreakdown: unknown;
  } | null;
}

export interface AdminDrawPreChecks {
  drawId: string;
  drawCode: string;
  status: string;
  scheduledAt: string;
  cutoffAt: string;
  executed: boolean;
  readyToRun: boolean;
  blockingIssues: string[];
  checks: {
    key: string;
    label: string;
    detail: string;
    ok: boolean;
    blocking: boolean;
  }[];
}

export interface AdminDrawTemplate {
  templateId: string;
  templateType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  label: string;
  prizeDescription: string;
  prizeValueNgn: number;
  ticketPriceNgn: number;
  ticketQuota: number | null;
  cutoffMinutesWat: number;
  scheduledMinutesWat: number;
  weekdays: number[];
  version: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByAdminId: string;
  approvedByAdminId: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  supersedesId: string | null;
  createdAt: string;
}

export interface AdminDailyReport {
  reportDate: string;
  generatedAt: string;
  draws: {
    drawCode: string;
    drawType: string;
    executedAt: string | null;
    seedCommittedAt: string | null;
    integrity: {
      winnerTicketRef: string;
      participants: number;
      ticketsSold: number;
      prizeValueNgn: number;
      rngSeedHash: string;
      merkleRoot: string;
      engineVersion: string;
      engineSignature: string;
      zeroInterventionConfirmed: boolean;
    } | null;
  }[];
  salesByChannel: {
    gateway: string;
    amountNgn: number;
    tickets: number;
    transactions: number;
  }[];
  totalSalesNgn: number;
  prizesSettled: {
    claimId: string;
    winnerTicketRef: string;
    claimType: string | null;
    status: string;
    grossPrizeValueNgn: number;
    whtAmountNgn: number;
    netPrizeValueNgn: number;
  }[];
  totalWhtWithheldNgn: number;
  claimsForfeited: number;
}

export interface AdminLevyReport {
  fromDate: string;
  toDate: string;
  ratePercent: number;
  generatedAt: string;
  states: {
    stateCode: string;
    tickets: number;
    salesNgn: number;
    levyDueNgn: number;
  }[];
  totals: { tickets: number; salesNgn: number; levyDueNgn: number };
}

export interface AdminWhtSchedule {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  deductions: {
    deductionRef: string;
    winnerTicketRef: string;
    winnerPhone: string;
    grossPrizeNgn: number;
    whtRatePercent: number;
    whtAmountNgn: number;
    netPrizeNgn: number;
    deductedAt: string;
  }[];
  totals: { deductions: number; grossPrizeNgn: number; whtPayableNgn: number };
}

export interface AdminSalesReport {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  byGateway: { gateway: string; transactions: number; tickets: number; amountNgn: number }[];
  byState: { stateCode: string; tickets: number; salesNgn: number }[];
  byDay: { day: string; tickets: number; salesNgn: number }[];
  totals: { salesNgn: number; tickets: number };
}

export interface AdminFinancialReport {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  revenue: { grossSalesNgn: number; transactions: number };
  costs: {
    prizesGrossNgn: number;
    prizesSettled: number;
    commissionNgn: number;
    commissionCount: number;
    levyAccruedNgn: number;
    levyRatePercent: number;
  };
  memo: { whtWithheldNgn: number };
  net: { grossMarginNgn: number };
}

export interface AdminAgentPerformance {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  agents: {
    agentId: string;
    agentCode: string;
    fullName: string;
    tier: string | null;
    status: string | null;
    stateCode: string | null;
    tickets: number;
    salesNgn: number;
    commissionRatePercent: number;
    estCommissionNgn: number;
  }[];
  totals: { activeSellers: number; tickets: number; salesNgn: number; estCommissionNgn: number };
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

  async listDraws(status?: string): Promise<{ draws: AdminDrawRow[] }> {
    return this.client.get('/admin/draws', { query: { status } });
  }

  async createDraw(input: {
    drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
    prizeDescription: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    scheduledAt: string;
    cutoffAt: string;
    ticketQuota?: number;
    prizeImageUrl?: string;
  }): Promise<AdminDrawRow> {
    return this.client.post('/admin/draws', input);
  }

  async cancelDraw(drawId: string): Promise<AdminDrawRow> {
    return this.client.post(`/admin/draws/${encodeURIComponent(drawId)}/cancel`, {});
  }

  async drawDetail(drawId: string): Promise<AdminDrawDetail> {
    return this.client.get(`/admin/draws/${encodeURIComponent(drawId)}`);
  }

  async updateDraw(
    drawId: string,
    input: Partial<{
      prizeDescription: string;
      prizeValueNgn: number;
      prizeImageUrl: string;
      ticketPriceNgn: number;
      ticketQuota: number;
      scheduledAt: string;
      cutoffAt: string;
    }>,
  ): Promise<unknown> {
    return this.client.patch(`/admin/draws/${encodeURIComponent(drawId)}`, input);
  }

  async drawPreChecks(drawId: string): Promise<AdminDrawPreChecks> {
    return this.client.get(`/admin/draws/${encodeURIComponent(drawId)}/pre-checks`);
  }

  async listDrawTemplates(status?: string): Promise<{ templates: AdminDrawTemplate[] }> {
    return this.client.get('/admin/draw-templates', { query: { status } });
  }

  async proposeDrawTemplate(input: {
    templateType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
    label: string;
    prizeDescription: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    ticketQuota?: number;
    cutoffMinutesWat: number;
    scheduledMinutesWat: number;
    weekdays: number[];
    effectiveFrom?: string;
  }): Promise<AdminDrawTemplate> {
    return this.client.post('/admin/draw-templates', input);
  }

  async approveDrawTemplate(templateId: string): Promise<AdminDrawTemplate> {
    return this.client.post(`/admin/draw-templates/${encodeURIComponent(templateId)}/approve`, {});
  }

  async rejectDrawTemplate(templateId: string, note: string): Promise<AdminDrawTemplate> {
    return this.client.post(`/admin/draw-templates/${encodeURIComponent(templateId)}/reject`, { note });
  }
  
  async dailyReport(date: string): Promise<AdminDailyReport> {
    return this.client.get('/admin/compliance/reports/daily', { query: { date } });
  }

  async levyReport(fromDate: string, toDate: string): Promise<AdminLevyReport> {
    return this.client.get('/admin/compliance/reports/levy', {
      query: { fromDate, toDate },
    });
  }

  async whtSchedule(fromDate: string, toDate: string): Promise<AdminWhtSchedule> {
    return this.client.get('/admin/compliance/reports/wht', { query: { fromDate, toDate } });
  }

  async salesReport(fromDate: string, toDate: string): Promise<AdminSalesReport> {
    return this.client.get('/admin/compliance/reports/sales', { query: { fromDate, toDate } });
  }

  async financialReport(fromDate: string, toDate: string): Promise<AdminFinancialReport> {
    return this.client.get('/admin/compliance/reports/financial', { query: { fromDate, toDate } });
  }

  async agentPerformance(fromDate: string, toDate: string): Promise<AdminAgentPerformance> {
    return this.client.get('/admin/compliance/reports/agents', { query: { fromDate, toDate } });
  }
}