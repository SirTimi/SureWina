import type {
  GetDrawResponse,
  GetResultDetailResponse,
  ListActiveDrawsResponse,
  ListPastResultsRequest,
  ListPastResultsResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

export class DrawsModule {
  constructor(private readonly client: ApiClient) {}

  async listActive(): Promise<ListActiveDrawsResponse> {
    return this.client.get<ListActiveDrawsResponse>('/draws/active', {
      skipAuth: true,
    });
  }

  async getById(drawCode: string): Promise<GetDrawResponse> {
    return this.client.get<GetDrawResponse>(
      `/draws/${encodeURIComponent(drawCode)}`,
      { skipAuth: true },
    );
  }

  async listResults(
    req?: ListPastResultsRequest,
  ): Promise<ListPastResultsResponse> {
    return this.client.get<ListPastResultsResponse>('/results', {
      skipAuth: true,
      query: {
        page: req?.page,
        pageSize: req?.pageSize,
        drawType: req?.drawType,
        fromDate: req?.fromDate,
        toDate: req?.toDate,
      },
    });
  }

  async getResultDetail(drawCode: string): Promise<GetResultDetailResponse> {
    return this.client.get<GetResultDetailResponse>(
      `/results/${encodeURIComponent(drawCode)}`,
      { skipAuth: true },
    );
  }
}