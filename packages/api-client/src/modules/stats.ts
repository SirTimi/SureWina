import type { RecentStatsResponse } from '@surewina/types';
import type { ApiClient } from '../client.js';

export class StatsModule {
  constructor(private readonly client: ApiClient) {}

  async getRecentStats(): Promise<RecentStatsResponse> {
    return this.client.get<RecentStatsResponse>('/stats/recent', {
      skipAuth: true,
    });
  }
}