import type { ApiClient } from '../client.js';

// ─── Shared ────────────────────────────────────────────────

export type CbaWalletState = 'NONE' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'READY';
export type CbaAccountPurpose = 'DEPOSIT' | 'WINNINGS' | 'FLOAT' | 'EARNINGS';

export interface CbaAccountBalance {
  purpose: CbaAccountPurpose;
  availableNgn: number;
  balanceNgn: number;
}

export interface CbaBalances {
  state: CbaWalletState;
  // False when the wallet is ready but the CBA could not be read: show
  // "unavailable", never zero.
  available: boolean;
  accounts: CbaAccountBalance[];
  spendableNgn: number | null;
  withdrawableNgn: number | null;
}

export type FundingAccountStatus = 'NOT_STARTED' | 'READY' | 'BEING_SET_UP' | 'NOT_AVAILABLE';

export interface FundingAccountView {
  status: FundingAccountStatus;
  accounts: Array<{ bankName: string; accountNumber: string; accountName: string }>;
}

export type WalletSetupStatus = 'NOT_STARTED' | 'READY' | 'BEING_SET_UP' | 'NOT_AVAILABLE';

export interface WalletOnboardingView {
  identity: { verified: false } | { verified: true; firstName: string; lastName: string };
  wallet: { status: WalletSetupStatus };
  funding: FundingAccountView;
}

export interface OnboardWalletRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  bvn: string;
  acceptTerms: boolean;
}

export interface WithdrawalAccountView {
  withdrawalAccountId: string;
  bankCode: string;
  bankName: string | null;
  accountLast4: string;
  accountName: string | null;
  status: 'ACTIVE' | 'REJECTED' | 'REMOVED';
  usableFrom: string | null;
  usable: boolean;
  createdAt: string;
}

export interface AddWithdrawalAccountRequest {
  bankCode: string;
  accountNumber: string;
  bvn: string;
  bankName?: string;
}

export type CbaWithdrawalStatus =
  | 'LOCKING'
  | 'FAILED'
  | 'AWAITING_APPROVAL'
  | 'LOCKED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'SUCCEEDED'
  | 'RESTORED'
  | 'REVIEW_REQUIRED';

export interface CbaWithdrawalView {
  withdrawalId: string;
  status: CbaWithdrawalStatus;
  amountNgn: number;
  bankCode: string;
  accountLast4: string;
  requiresApproval: boolean;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface RequestWithdrawalRequest {
  withdrawalAccountId: string;
  amountNgn: number;
  requestId: string;
}

export interface PrizeWalletCreditResponse {
  claimId: string;
  status: string;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  creditedNgn: number;
  reference: string;
}

export interface AgentCbaWalletView extends CbaBalances {
  funding: FundingAccountView;
}

// ─── Finance ───────────────────────────────────────────────

export interface AdminCbaWithdrawalRow extends CbaWithdrawalView {
  walletId: string;
  ownerType: 'CUSTOMER' | 'AGENT';
  payoutReference: string;
  payoutStatus: string | null;
  payoutRawStatus: string | null;
  settledAt: string | null;
}

export type CbaReconciliationStatus = 'PASS' | 'SHORTFALL' | 'MISMATCH' | 'INCOMPLETE';

export interface CbaReconciliationIssue {
  code: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  detail?: Record<string, unknown>;
}

export interface CbaReconciliationRunView {
  runId: string;
  businessDate: string;
  status: CbaReconciliationStatus;
  triggeredBy: string;
  vaultNgn: number;
  ownersNgn: number;
  salesNgn: number;
  pendingWithdrawalsNgn: number;
  expectedPendingWithdrawalsNgn: number;
  uncreditedTopUpsNgn: number;
  paidUnsettledWithdrawalsNgn: number;
  obligationsNgn: number;
  coverageNgn: number;
  unexplainedNgn: number;
  accountsRead: number;
  accountsFailed: number;
  issues: CbaReconciliationIssue[];
  startedAt: string;
  completedAt: string;
}

export type CbaTransferStatus = 'PENDING' | 'SENDING' | 'POSTED' | 'FAILED' | 'UNCERTAIN';

export interface AdminCbaTransferRow {
  transferId: string;
  reference: string;
  purpose: string;
  status: CbaTransferStatus;
  amountNgn: number;
  walletId: string;
  fromAccountId: number;
  toAccountId: number;
  walletPurchaseId: string | null;
  paymentTxnId: string | null;
  prizeClaimId: string | null;
  saleReference: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveCbaTransferRequest {
  outcome: 'POSTED' | 'NOT_POSTED';
  cbaTransferId?: number;
  note: string;
}

export interface CbaLedgerBalancePreview {
  walletId: string;
  ownerType: 'CUSTOMER' | 'AGENT';
  cbaState: CbaWalletState;
  ledgerAvailableNgn: number;
  ledgerHeldNgn: number;
  allowedPurposes: CbaAccountPurpose[];
  migration: {
    migrationId: string;
    amountNgn: number;
    purpose: CbaAccountPurpose;
    status: 'PENDING' | 'CREDITED' | 'FAILED' | 'REVIEW_REQUIRED';
    failureReason: string | null;
    creditedAt: string | null;
    createdAt: string;
  } | null;
}

// CBA wallets: balances held at the CBA, bank-transfer funding, saved
// withdrawal accounts and withdrawals — for customers, agents and finance.
export class CbaModule {
  constructor(private readonly client: ApiClient) {}

  // ── Customer ──
  onboardingStatus() {
    return this.client.get<WalletOnboardingView>('/wallet/onboarding');
  }

  onboard(input: OnboardWalletRequest) {
    return this.client.post<WalletOnboardingView>('/wallet/onboarding', input);
  }

  balances() {
    return this.client.get<CbaBalances>('/wallet/cba/balances');
  }

  withdrawalAccounts() {
    return this.client.get<WithdrawalAccountView[]>('/wallet/withdrawal-accounts');
  }

  addWithdrawalAccount(input: AddWithdrawalAccountRequest) {
    return this.client.post<WithdrawalAccountView>('/wallet/withdrawal-accounts', input);
  }

  removeWithdrawalAccount(withdrawalAccountId: string) {
    return this.client.delete<{ removed: true }>(`/wallet/withdrawal-accounts/${withdrawalAccountId}`);
  }

  withdrawals() {
    return this.client.get<CbaWithdrawalView[]>('/wallet/cba-withdrawals');
  }

  withdraw(input: RequestWithdrawalRequest) {
    return this.client.post<CbaWithdrawalView>('/wallet/cba-withdrawals', input);
  }

  // Banks a withdrawal account can use: Monnify's list and codes, since
  // Monnify pays withdrawals. Not account.listNigerianBanks (Paystack's).
  withdrawalBanks() {
    return this.client.get<{ banks: Array<{ code: string; name: string }> }>('/wallet/withdrawal-banks');
  }

  creditPrizeToWallet(claimId: string) {
    return this.client.post<PrizeWalletCreditResponse>(`/claims/${claimId}/wallet`, {});
  }

  // ── Agent ──
  // Monnify's list and codes, as for customers.
  agentBanks() {
    return this.client.get<{ banks: Array<{ code: string; name: string }> }>('/agent/banks');
  }

  agentWallet() {
    return this.client.get<AgentCbaWalletView>('/agent/wallet/cba');
  }

  agentFundingAccount(bvn: string) {
    return this.client.post<FundingAccountView>('/agent/wallet/cba/funding-account', { bvn });
  }

  agentWithdrawalAccounts() {
    return this.client.get<WithdrawalAccountView[]>('/agent/withdrawal-accounts');
  }

  agentAddWithdrawalAccount(input: AddWithdrawalAccountRequest) {
    return this.client.post<WithdrawalAccountView>('/agent/withdrawal-accounts', input);
  }

  agentRemoveWithdrawalAccount(withdrawalAccountId: string) {
    return this.client.delete<{ removed: true }>(`/agent/withdrawal-accounts/${withdrawalAccountId}`);
  }

  agentWithdrawals() {
    return this.client.get<CbaWithdrawalView[]>('/agent/withdrawals');
  }

  agentWithdraw(input: RequestWithdrawalRequest) {
    return this.client.post<CbaWithdrawalView>('/agent/withdrawals', input);
  }

  // ── Finance ──
  adminWithdrawals(status?: CbaWithdrawalStatus) {
    return this.client.get<AdminCbaWithdrawalRow[]>('/admin/finance/cba-withdrawals', {
      query: status ? { status } : undefined,
    });
  }

  adminApproveWithdrawal(withdrawalId: string) {
    return this.client.post<CbaWithdrawalView>(`/admin/finance/cba-withdrawals/${withdrawalId}/approve`, {});
  }

  adminRejectWithdrawal(withdrawalId: string) {
    return this.client.post<CbaWithdrawalView>(`/admin/finance/cba-withdrawals/${withdrawalId}/reject`, {});
  }

  adminRefreshWithdrawal(withdrawalId: string) {
    return this.client.post<CbaWithdrawalView>(`/admin/finance/cba-withdrawals/${withdrawalId}/refresh`, {});
  }

  adminReconciliationRuns(limit = 30) {
    return this.client.get<CbaReconciliationRunView[]>('/admin/finance/cba/reconciliation/runs', {
      query: { limit },
    });
  }

  adminRunReconciliation() {
    return this.client.post<CbaReconciliationRunView>('/admin/finance/cba/reconciliation/runs', {});
  }

  adminTransfers(status?: CbaTransferStatus) {
    return this.client.get<AdminCbaTransferRow[]>('/admin/finance/cba/transfers', {
      query: status ? { status } : undefined,
    });
  }

  adminResolveTransfer(transferId: string, input: ResolveCbaTransferRequest) {
    return this.client.post<{ transferId: string; status: CbaTransferStatus; next: Record<string, unknown> }>(
      `/admin/finance/cba/transfers/${transferId}/resolve`,
      input,
    );
  }

  adminRetryTransfer(transferId: string) {
    return this.client.post<{ transferId: string; status: CbaTransferStatus; failureReason: string | null }>(
      `/admin/finance/cba/transfers/${transferId}/retry`,
      {},
    );
  }

  adminLedgerBalance(walletId: string) {
    return this.client.get<CbaLedgerBalancePreview>(`/admin/finance/cba/wallets/${walletId}/ledger-balance`);
  }

  adminMoveLedgerBalance(walletId: string, purpose: CbaAccountPurpose) {
    return this.client.post<CbaLedgerBalancePreview['migration']>(
      `/admin/finance/cba/wallets/${walletId}/ledger-balance/move`,
      { purpose },
    );
  }
}
