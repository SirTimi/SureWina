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

export interface SurewinaApi {
  health: HealthModule;
  tickets: TicketsModule;
  draws: DrawsModule;
  auth: AuthModule;
  agents: AgentsModule;
  admin: AdminModule;
  stats: StatsModule;
  dashboard: DashboardModule;
}

export function createClient(config: ApiClientConfig): SurewinaApi {
  const client = new ApiClient(config);
  return {
    health: new HealthModule(client),
    tickets: new TicketsModule(client),
    draws: new DrawsModule(client),
    auth: new AuthModule(client),
    agents: new AgentsModule(client),
    admin: new AdminModule(client),
    stats: new StatsModule(client),
    dashboard: new DashboardModule(client),
  };
}

export { ApiClient } from './client.js';
export { ApiError } from './types.js';
export type { ApiClientConfig, RequestOptions } from './types.js';
export type { HealthResponse } from './modules/health.js';