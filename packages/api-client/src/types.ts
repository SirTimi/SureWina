import type { ApiErrorResponse } from '@surewina/types';

export interface ApiClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  getAuthToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  skipAuth?: boolean;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly aborted: boolean;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    details?: Record<string, unknown>;
    aborted?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.aborted = params.aborted ?? false;
  }

  isUnauthorized(): boolean { return this.status === 401; }
  isClientError(): boolean { return this.status >= 400 && this.status < 500; }
  isServerError(): boolean { return this.status >= 500; }
  isNetworkError(): boolean { return this.status === 0; }
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.error !== 'object' || v.error === null) return false;
  const err = v.error as Record<string, unknown>;
  return typeof err.code === 'string' && typeof err.message === 'string';
}