import type { ApiClient } from '../client.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  service: string;
  version: string;
}

export class HealthModule {
  constructor(private readonly client: ApiClient) {}
  check(): Promise<HealthResponse> {
    return this.client.get<HealthResponse>('/health', { skipAuth: true });
  }
}