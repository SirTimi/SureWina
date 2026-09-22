import { ApiClient } from './client.js';
import type { ApiClientConfig } from './types.js';
import { HealthModule } from './modules/health.js';
import { TicketsModule } from './modules/tickets.js';
import { DrawsModule } from './modules/draws.js';
import { AuthModule } from './modules/auth.js';
import { AgentsModule } from './modules/agents.js';
import { AdminModule } from './modules/admin.js';
import { StatsModule } from './modules/stats.js';
import { DashboardModule } from './modules/dashboard.js';
import { AccountModule } from './modules/account.js';
import { ClaimsModule } from './modules/claims.js';
import { WalletModule } from './modules/wallet.js';

export interface SurewinaApi {
  health: HealthModule;
  tickets: TicketsModule;
  draws: DrawsModule;
  auth: AuthModule;
  agents: AgentsModule;
  admin: AdminModule;
  stats: StatsModule;
  dashboard: DashboardModule;
  account: AccountModule;
  claims: ClaimsModule;
  wallet: WalletModule;

}

export function createClient(config: ApiClientConfig): SurewinaApi {
  const client = new ApiClient(config);
  const account = new AccountModule(client);
  const auth = new AuthModule(client);
  const dashboard = new DashboardModule(client);

  return {
    health: new HealthModule(client),
    tickets: new TicketsModule(client),
    draws: new DrawsModule(client),
    auth,
    agents: new AgentsModule(client),
    admin: new AdminModule(client),
    stats: new StatsModule(client),
    dashboard,
    account,
    claims: new ClaimsModule(client),
    wallet: new WalletModule(client),
  };
}

export { ApiClient } from './client.js';
export { ApiError } from './types.js';
export type { ApiClientConfig, RequestOptions } from './types.js';
export type { HealthResponse } from './modules/health.js';
export type { AdminDashboard, AdminMe, AdminFunction, AdminTier, AdminAgentRow, AdminCustomerDetail, AdminClaimRow, AdminRemittanceRow, AdminDrawRow, AdminDrawDetail, AdminDrawPreChecks, AdminDrawTemplate, AdminDailyReport, AdminLevyReport, AdminWhtSchedule, AdminFinancialReport, AdminSalesReport, AdminAgentPerformance, AdminAuditRow, AdminAuditSearch, AdminPayoutList, AdminPayoutRow, AdminSeedRow, AdminJackpotOverview, AdminPaymentRow, AdminTicketSearchRow, AdminClaimDetail, AdminSetting, AdminUserRow, AdminCollectionPoint, AdminDisputeDetail, AdminDisputeEvent, AdminDisputeRow, AdminAuthResponse, AdminLoginResult, AdminMfaChallenge, AdminAuditIntegrity,AdminNotification, AdminNotificationList, AdminPayoutAttempt, AdminReconciliation, AdminTreasuryProvider, AdminTreasuryAccount, AdminTreasuryOverview, AdminTreasurySettlement, AdminReconciliationRun, AdminReconciliationIssue, AdminFinanceWalletOwner, AdminFinanceWalletRow, AdminFinanceWalletDetail, AdminWalletFundingReview } from './modules/admin.js';
export type { TicketReceipt } from './modules/tickets.js';
export type { CustomerDisputeRow, CustomerDisputeStatus, ListCustomerDisputesResponse, RaiseDisputeRequest, RaiseDisputeResponse } from '@surewina/types';
export type { AgentSalePrint } from './modules/agents.js';
export type { WalletView, WalletStatus, WalletOwnerType, WalletFundingGateway, WalletFundingStatus, WalletFundingView, WalletFundingHistoryResponse, WalletLedgerEntry, WalletLedgerTransaction, WalletHistoryResponse, InitiateWalletFundingRequest, InitiateWalletFundingResponse, WalletTicketPurchaseRequest, WalletTicketPurchaseResponse } from './modules/wallet.js';
