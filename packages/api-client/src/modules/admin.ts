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
  collectionPointId: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
}

export interface AdminAuthResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  admin: AdminMe;
}
export interface AdminMfaChallenge {
  mfaRequired: true;
  challengeId: string;
  expiresInSeconds: number;
}

export type AdminLoginResult = AdminAuthResponse | AdminMfaChallenge;

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
  // Zero-padded to six digits, matching what is printed on the ticket.
  // Null only for agents created before terminals were assigned.
  terminalNumber: string | null;
  fullName: string;
  phoneNumber: string;
  registeredStateCode: string;
  status: string;
  tier: string;
  commissionRate: number;
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
  accumulation: {
    thisWeek: {
      ticketCount: number;
      entriesEarned: number;
      ticketsToNextEntry: number;
    };
    lifetime: {
      ticketCount: number;
      entriesEarned: number;
    };
    lastTicketAt: string;
  } | null;
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

export interface AdminAuditRow {
  logId: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  actorType: 'SYSTEM' | 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'ENGINE';
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: unknown;
  ipAddress: string | null;
}

export interface AdminAuditSearch {
  rows: AdminAuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPayoutRow {
  claimId: string;
  winnerTicketRef: string;
  winnerPhone: string;
  status: string;
  claimType: string | null;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  payoutReference: string | null;
  channel: 'AGENT_CASH' | 'BANK_TRANSFER';
  payoutInitiatedAt: string | null;
  accountLast4: string | null;
  fulfilledAt: string | null;
}

export interface AdminPayoutList {
  payouts: AdminPayoutRow[];
  totals: { count: number; grossNgn: number; netPaidNgn: number };
}

export interface AdminSeedRow {
  drawId: string;
  drawCode: string;
  drawType: string;
  status: string;
  scheduledAt: string;
  committedHash: string;
  committedAt: string | null;
  revealed: boolean;
  revealedSeed: string | null;
  revealMatches: boolean | null;
  executedAt: string | null;
  engineSignature: string | null;
}

export interface AdminJackpotOverview {
  generatedAt: string;
  upcomingDraws: {
    drawId: string;
    drawCode: string;
    scheduledAt: string;
    status: string;
    prizeValueNgn: number;
    ticketPriceNgn: number;
    entries: { direct: number; accumulated: number; total: number };
  }[];
  accumulation: {
    participants: number;
    totalEntriesEarned: number;
    ticketsCounted: number;
    nearThreshold: {
      buyerPhone: string;
      progress: number;
      entriesEarned: number;
      lastTicketAt: string;
    }[];
  };
}

export interface AdminTicketSearchRow {
  ticketRef: string;
  drawCode: string;
  drawStatus: string;
  prizeDescription: string;
  buyerPhone: string;
  faceValueNgn: number;
  channel: string;
  stateOfPlayCode: string;
  status: string;
  isWinner: boolean;
  agentCode: string | null;
  payment: { txnId: string; gateway: string; status: string; gatewayReference: string };
  createdAt: string;
}

export interface AdminPaymentRow {
  txnId: string;
  gatewayReference: string;
  gateway: string;
  status: string;
  buyerPhone: string;
  amountNgn: number;
  ticketCount: number;
  failureReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AdminClaimDetail {
  claimId: string;
  winnerTicketRef: string;
  winnerPhone: string;
  status: string;
  claimType: string | null;
  claimTypeSelectedAt: string | null;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  selectionDeadlineAt: string;
  claimDeadlineAt: string;
  forfeitedAt: string | null;
  createdAt: string;
  draw: {
    drawCode: string;
    drawType: string;
    prizeDescription: string;
    prizeValueNgn: number;
    executedAt: string;
  };
  kyc: {
    bvnVerified: boolean;
    bvnVerifiedAt: string | null;
    hasIdDoc: boolean;
    hasSelfie: boolean;
    bank: { bankCode: string | null; accountLast4: string | null; accountName: string } | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  payout: { reference: string; initiatedAt: string | null; accountLast4: string | null } | null;
  collection: {
    pointName: string;
    stateCode: string;
    address: string;
    scheduledAt: string | null;
  } | null;
  whtDeduction: { deductionRef: string; whtAmountNgn: number; deductedAt: string } | null;
  fulfilledAt: string | null;
}

export interface AdminSetting {
  key: string;
  value: string;
  description: string;
  updatedByAdminId: string | null;
  updatedAt: string;
}

export interface AdminUserRow {
  adminUserId: string;
  email: string;
  fullName: string;
  role: 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';
  tier: 'BASIC' | 'INTERMEDIATE' | 'SUPER' | 'AUDITOR';
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  locked: boolean;
  createdAt: string;
}

export interface AdminCollectionPoint {
  pointId: string;
  name: string;
  stateCode: string;
  address: string;
}

export interface AdminDisputeRow {
  disputeId: string;
  disputeRef: string;
  category: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'REJECTED';
  customerPhone: string;
  subject: string;
  raisedByType: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  assignedToAdminId: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDisputeEvent {
  eventId: string;
  type: string;
  actorType: string;
  actorId: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
}

export interface AdminDisputeDetail {
  disputeId: string;
  disputeRef: string;
  category: string;
  status: AdminDisputeRow['status'];
  raisedByType: string;
  raisedByAdminId: string | null;
  customerPhone: string;
  subject: string;
  links: {
    ticketRef: string | null;
    paymentTxnId: string | null;
    claimId: string | null;
    agentCode: string | null;
  };
  assignedToAdminId: string | null;
  resolutionNote: string | null;
  resolvedByAdminId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: AdminDisputeEvent[];
}

export interface AdminAuditIntegrity {
  checkpoints: number;
  intact: boolean;
  brokenWindows: number;
  latestRootHash: string | null;
  results: {
    checkpointId: string;
    fromSeq: number;
    toSeq: number;
    windowEnd: string;
    expectedEntries: number;
    foundEntries: number;
    intact: boolean;
  }[];
}

export interface AdminNotification {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  detail: string;
  count: number;
  href: string;
}

export interface AdminNotificationList {
  notifications: AdminNotification[];
  total: number;
  generatedAt: string;
}

export class AdminModule {
  constructor(private readonly client: ApiClient) {}

  // Returns either a token, or an MFA challenge when the admin has MFA on.
  async login(email: string, password: string): Promise<AdminLoginResult> {
    return this.client.post(
      '/admin/auth/login',
      { email, password },
      { skipAuth: true },
    );
  }

  // Second stage of login — accepts a TOTP code or a backup code.
  async verifyMfa(challengeId: string, code: string): Promise<AdminAuthResponse> {
    return this.client.post(
      '/admin/auth/mfa/verify',
      { challengeId, code },
      { skipAuth: true },
    );
  }

  // Enrollment: returns the secret + otpauth URI for the QR code.
  async setupMfa(): Promise<{ secret: string; otpauthUri: string }> {
    return this.client.post('/admin/auth/mfa/setup', {});
  }

  // Confirms enrollment with a live code; backup codes are shown once.
  async activateMfa(token: string): Promise<{ backupCodes: string[] }> {
    return this.client.post('/admin/auth/mfa/activate', { token });
  }

  async getMe(): Promise<{
    adminUserId: string;
    email: string;
    fullName: string;
    role: 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';
    tier: 'BASIC' | 'INTERMEDIATE' | 'SUPER' | 'AUDITOR';
    collectionPointId: string | null;
    mfaEnabled: boolean;
    lastLoginAt: string | null;
    mustChangePassword: boolean;
  }> {
    return this.client.get('/admin/auth/me');
  }

  async dashboard(): Promise<AdminDashboard> {
    return this.client.get('/admin/dashboard');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    return this.client.post('/admin/auth/change-password', { currentPassword, newPassword });
  }

    async listAgents(params?: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    agents: AdminAgentRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.client.get('/admin/agents', {
      query: {
        status: params?.status,
        search: params?.search,
        page: params?.page,
        pageSize: params?.pageSize,
      },
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

  async searchAudit(params?: {
    action?: string;
    actorType?: string;
    actorId?: string;
    resourceType?: string;
    resourceId?: string;
    severity?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminAuditSearch> {
    return this.client.get('/admin/compliance/audit', { query: { ...params } });
  }

  async listPayouts(params?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AdminPayoutList> {
    return this.client.get('/admin/finance/payouts', { query: { ...params } });
  }

  async seedRegistry(status?: string): Promise<{ seeds: AdminSeedRow[] }> {
    return this.client.get('/admin/draws/seeds/list', { query: { status } });
  }

  async jackpotOverview(): Promise<AdminJackpotOverview> {
    return this.client.get('/admin/dashboard/jackpot');
  }

  async searchTickets(q: string): Promise<{ tickets: AdminTicketSearchRow[] }> {
    return this.client.get('/admin/tickets/search', { query: { q } });
  }

  async listPayments(params?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{ payments: AdminPaymentRow[] }> {
    return this.client.get('/admin/tickets/payments', { query: { ...params } });
  }

  async claimDetail(claimId: string): Promise<AdminClaimDetail> {
    return this.client.get(`/admin/compliance/claims/${encodeURIComponent(claimId)}`);
  }

  // Authed binary fetch: <img src> can't carry the JWT, so we fetch the bytes
  // ourselves and hand the page a Blob to object-URL.
  async fetchClaimEvidence(claimId: string, kind: 'id-doc' | 'selfie'): Promise<Blob> {
    return this.client.getBlob(
      `/admin/compliance/claims/${encodeURIComponent(claimId)}/evidence/${kind}`,
    );
  }

  async listSettings(): Promise<{ settings: AdminSetting[] }> {
    return this.client.get('/admin/settings');
  }

  async updateSetting(key: string, value: string): Promise<AdminSetting> {
    return this.client.patch(`/admin/settings/${encodeURIComponent(key)}`, { value });
  }

  async listAdminUsers(): Promise<{ users: AdminUserRow[] }> {
    return this.client.get('/admin/users');
  }

  async adminUserDetail(adminUserId: string): Promise<AdminUserRow> {
    return this.client.get(`/admin/users/${encodeURIComponent(adminUserId)}`);
  }

  async createAdminUser(input: {
    email: string;
    fullName: string;
    role: string;
    tier: string;
  }): Promise<AdminUserRow & { temporaryPassword: string }> {
    return this.client.post('/admin/users', input);
  }

  async updateAdminUser(
    adminUserId: string,
    input: { role?: string; tier?: string; isActive?: boolean },
  ): Promise<AdminUserRow> {
    return this.client.patch(`/admin/users/${encodeURIComponent(adminUserId)}`, input);
  }

  async resetAdminPassword(
    adminUserId: string,
  ): Promise<{ adminUserId: string; temporaryPassword: string }> {
    return this.client.post(`/admin/users/${encodeURIComponent(adminUserId)}/reset-password`, {});
  }

  async listDisputes(params?: { status?: string; customerPhone?: string }): Promise<{ disputes: AdminDisputeRow[] }> {
    return this.client.get('/admin/disputes', { query: { ...params } });
  }

  async disputeDetail(disputeId: string): Promise<AdminDisputeDetail> {
    return this.client.get(`/admin/disputes/${encodeURIComponent(disputeId)}`);
  }

  async createDispute(input: {
    category: string;
    subject: string;
    customerPhone: string;
    ticketRef?: string;
    paymentTxnId?: string;
    claimId?: string;
    agentCode?: string;
  }): Promise<AdminDisputeDetail> {
    return this.client.post('/admin/disputes', input);
  }

  async addDisputeNote(disputeId: string, note: string): Promise<AdminDisputeDetail> {
    return this.client.post(`/admin/disputes/${encodeURIComponent(disputeId)}/notes`, { note });
  }

  async transitionDispute(disputeId: string, to: string, note?: string): Promise<AdminDisputeDetail> {
    return this.client.post(`/admin/disputes/${encodeURIComponent(disputeId)}/transition`, { to, note });
  }

  async onboardAgent(input: {
    fullName: string;
    phoneNumber: string;
    email: string;
    registeredStateCode: string;
    nin: string;
    bvn: string;
    idDocType: string;
    onboardingNote?: string;
  }): Promise<{ agentId: string; agentCode: string; status: string, terminalNumber: string | null }> {
    return this.client.post('/admin/agents/onboard', input);
  }

  async approveAgent(agentId: string): Promise<{ agentId: string; agentCode: string; status: string }> {
    return this.client.post(`/admin/agents/${encodeURIComponent(agentId)}/approve`, {});
  }

  async auditIntegrity(): Promise<AdminAuditIntegrity> {
    return this.client.get('/admin/compliance/audit/integrity');
  }

  async notifications(): Promise<AdminNotificationList> {
    return this.client.get('/admin/notifications');
  }

    async verifyRedemption(ticketRef: string, code: string): Promise<{
    claimId: string;
    winnerTicketRef: string;
    winnerPhone: string;
    claimType: 'PRODUCT' | 'CASH';
    prizeDescription: string;
    drawCode: string;
    grossPrizeValueNgn: number;
    whtAmountNgn: number;
    netPrizeValueNgn: number;
    collectionPoint: string | null;
    claimDeadlineAt: string;
    verified: boolean;
  }> {
    return this.client.post('/collection-point/verify', { ticketRef, code });
  }

  async confirmRedemption(ticketRef: string, code: string): Promise<{
    claimId: string;
    winnerTicketRef: string;
    netPrizeValueNgn: number;
    redeemed: boolean;
  }> {
    return this.client.post('/collection-point/confirm', { ticketRef, code });
  }

  async listCollectionPoints(): Promise<{ points: AdminCollectionPoint[] }> {
    return this.client.get('/admin/users/collection-points/list');
  }
}