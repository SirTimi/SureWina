import type { RecentStatsResponse } from '@surewina/types';
import type { ApiClient } from '../client.js';
import { MOCK_RECENT_STATS } from './mock-data.js';

export class StatsModule {
  constructor(private readonly client: ApiClient) {}

  async getRecentStats(): Promise<RecentStatsResponse> {
    // TODO Phase 6+: return this.client.get('/stats/recent');
    return Promise.resolve(MOCK_RECENT_STATS);
  }
}