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
  };
}

export { ApiClient } from './client.js';
export { ApiError } from './types.js';
export type { ApiClientConfig, RequestOptions } from './types.js';
export type { HealthResponse } from './modules/health.js';
export type { AdminDashboard, AdminMe, AdminFunction, AdminTier, AdminAgentRow, AdminCustomerDetail, AdminClaimRow, AdminRemittanceRow, AdminDrawRow, AdminDrawDetail, AdminDrawPreChecks, AdminDrawTemplate, AdminDailyReport, AdminLevyReport, AdminWhtSchedule, AdminFinancialReport, AdminSalesReport, AdminAgentPerformance, AdminAuditRow, AdminAuditSearch, AdminPayoutList, AdminPayoutRow, AdminSeedRow, AdminJackpotOverview, AdminPaymentRow, AdminTicketSearchRow, AdminClaimDetail, AdminSetting, AdminUserRow } from './modules/admin.js';