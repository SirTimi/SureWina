export type Timestamp = string;
export type UUID = string;
export type PhoneE164 = string;
export type StateCode = string;
export type NairaAmount = number;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type PurchaseChannel = 'DIRECT' | 'AGENT';
export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';