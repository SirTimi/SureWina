import type {
  RemoveSpendLimitRequest,
  RequestBreakRequest,
  RequestBreakResponse,
  UpdateBankAccountRequest,
  UpdateBankAccountResponse,
  UpdateNotificationPreferencesRequest,
  UpdateProfileRequest,
  UpdateSpendLimitRequest,
  UserMe,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

const BREAK_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '180d': 90, // backend caps breaks at 90 days; support handles longer
  permanent: 90,
};

export class AccountModule {
  constructor(private readonly client: ApiClient) {}

  async updateProfile(req: UpdateProfileRequest): Promise<UserMe> {
    return this.client.patch<UserMe>('/account/profile', {
      displayName: req.displayName,
      email: req.email,
    });
  }

  async updateNotificationPreferences(
    req: UpdateNotificationPreferencesRequest,
  ): Promise<UserMe> {
    return this.client.patch<UserMe>('/account/notifications', {
      sms: req.sms,
      push: req.push,
      email: req.email,
    });
  }

  async updateBankAccount(
    req: UpdateBankAccountRequest,
  ): Promise<UpdateBankAccountResponse> {
    const me = await this.client.put<UserMe & { resolvedAccountName?: string }>(
      '/account/bank',
      { accountNumber: req.accountNumber, bankCode: req.bankCode },
    );
    return {
      bankAccount: {
        bankName: me.bankAccount?.bankName ?? req.bankCode,
        accountNumber: me.bankAccount?.accountNumber ?? req.accountNumber.slice(-4),
        accountName: me.resolvedAccountName ?? '',
      },
    };
  }

  async updateSpendLimit(req: UpdateSpendLimitRequest): Promise<UserMe> {
    return this.client.put<UserMe>('/account/spend-limit', {
      period: req.period,
      capNgn: req.capNgn,
    });
  }

  async removeSpendLimit(_req: RemoveSpendLimitRequest): Promise<UserMe> {
    // Backend policy: removal goes through support; this surfaces the 409
    // message to the settings screen rather than pretending it worked.
    return this.client.delete<UserMe>('/account/spend-limit');
  }

  async requestBreak(req: RequestBreakRequest): Promise<RequestBreakResponse> {
    const me = await this.client.post<UserMe>('/account/break', {
      days: BREAK_DAYS[req.duration] ?? 30,
    });
    return { selfExclusionUntil: me.selfExclusionUntil };
  }
}