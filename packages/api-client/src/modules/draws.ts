import type {
  GetDrawResponse,
  GetResultDetailResponse,
  ListActiveDrawsResponse,
  ListPastResultsRequest,
  ListPastResultsResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import {
  MOCK_ACTIVE_DRAWS,
  MOCK_DRAW_BY_ID,
  MOCK_PAST_RESULTS,
  MOCK_RESULT_DETAIL,
} from './mock-data.js';

export class DrawsModule {
  constructor(private readonly client: ApiClient) {}

  async listActive(): Promise<ListActiveDrawsResponse> {
    // TODO Phase 6+: return this.client.get<ListActiveDrawsResponse>('/draws/active');
    return Promise.resolve({ draws: MOCK_ACTIVE_DRAWS });
  }

  async getById(drawCode: string): Promise<GetDrawResponse> {
    // TODO Phase 6+: return this.client.get(`/draws/${drawCode}`);
    const draw = MOCK_DRAW_BY_ID[drawCode];
    if (!draw) throw new Error(`Mock draw not found: ${drawCode}`);
    return Promise.resolve(draw);
  }

  async listResults(req?: ListPastResultsRequest): Promise<ListPastResultsResponse> {
    // TODO Phase 6+: real call
    const page = req?.page ?? 1;
    const pageSize = req?.pageSize ?? 10;
    let results = [...MOCK_PAST_RESULTS];

    if (req?.drawType) results = results.filter((r) => r.drawType === req.drawType);
    if (req?.fromDate) results = results.filter((r) => r.executedAt >= req.fromDate!);
    if (req?.toDate) results = results.filter((r) => r.executedAt <= req.toDate!);

    const start = (page - 1) * pageSize;
    return Promise.resolve({
      results: results.slice(start, start + pageSize),
      total: results.length,
      page,
      pageSize,
    });
  }

  async getResultDetail(drawCode: string): Promise<GetResultDetailResponse> {
    // TODO Phase 6+: real call
    const detail = MOCK_RESULT_DETAIL[drawCode];
    if (!detail) throw new Error(`Mock result not found: ${drawCode}`);
    return Promise.resolve(detail);
  }
}