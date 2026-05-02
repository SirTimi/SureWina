import type { ApiClientConfig, RequestOptions } from './types.js';
import { ApiError, isApiErrorResponse } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      query,
      headers: requestHeaders,
      timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      skipAuth = false,
      signal: externalSignal,
    } = options;

    const url = this.buildUrl(path, query);
    const headers = await this.buildHeaders(skipAuth, requestHeaders);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && this.config.onUnauthorized) {
        this.config.onUnauthorized();
      }

      const responseText = await response.text();
      let responseBody: unknown = undefined;
      if (responseText) {
        try { responseBody = JSON.parse(responseText); } catch { responseBody = responseText; }
      }

      if (!response.ok) throw this.toApiError(response.status, responseBody);

      return responseBody as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError({
          message: externalSignal?.aborted ? 'Request was cancelled' : `Request timed out after ${timeoutMs}ms`,
          status: 0,
          code: externalSignal?.aborted ? 'CANCELLED' : 'TIMEOUT',
          aborted: true,
        });
      }
      throw new ApiError({
        message: err instanceof Error ? err.message : 'Network request failed',
        status: 0,
        code: 'NETWORK_ERROR',
      });
    }
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${base}${cleanPath}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }

  private async buildHeaders(
    skipAuth: boolean,
    requestHeaders?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.config.defaultHeaders,
      ...requestHeaders,
    };
    if (!skipAuth && this.config.getAuthToken) {
      const token = await this.config.getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private toApiError(status: number, body: unknown): ApiError {
    if (isApiErrorResponse(body)) {
      return new ApiError({
        message: body.error.message,
        status,
        code: body.error.code,
        details: body.error.details,
      });
    }
    return new ApiError({
      message: typeof body === 'string' ? body : `Request failed with status ${status}`,
      status,
      code: 'UNKNOWN_ERROR',
    });
  }
}