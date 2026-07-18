import type { ApiClient } from '../client.js';

export type AdminFunction =
  | 'OPERATOR'
  | 'COMPLIANCE_OFFICER'
  | 'FINANCE_OFFICER'
  | 'SUPPORT_AGENT';

export type AdminTier = 'BASIC' | 'INTERMEDIATE' | 'SUPER' | 'AUDITOR';

export interface AdminMe {
  adminUserId: string;
  email: string;
  fullName: string;
  role: AdminFunction;
  tier: AdminTier;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
}

export interface AdminDashboard {
  asOf: string;
  today: {
    direct: { salesNgn: number; tickets: number; transactions: number };
    agent: { salesNgn: number; tickets: number; transactions: number };
    totalSalesNgn: number;
  };
  draws: Record<string, number>;
  claims: Record<string, number>;
  remittance: { outstandingNgn: number; openCount: number };
  commission: { pendingNgn: number; pendingCount: number };
  actionRequired: { kycPendingReview: number; activeDraws: number };
}

export class AdminModule {
  constructor(private readonly client: ApiClient) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; tokenType: string; expiresInSeconds: number; admin: AdminMe }> {
    return this.client.post(
      '/admin/auth/login',
      { email, password },
      { skipAuth: true },
    );
  }

  async getMe(): Promise<AdminMe> {
    return this.client.get('/admin/auth/me');
  }

  async dashboard(): Promise<AdminDashboard> {
    return this.client.get('/admin/dashboard');
  }
}