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
import { MOCK_USER_ME } from './mock-data.js';

// Mock account state — single shared mutable object so all calls see the same view.
// In real backend this is just persisted in PostgreSQL.
const mockState: UserMe = { ...MOCK_USER_ME };

const NIGERIAN_BANKS: Record<string, string> = {
  '044': 'Access Bank',
  '058': 'Guaranty Trust Bank',
  '011': 'First Bank of Nigeria',
  '033': 'United Bank for Africa',
  '232': 'Sterling Bank',
  '057': 'Zenith Bank',
  '070': 'Fidelity Bank',
  '076': 'Polaris Bank',
  '050': 'Ecobank Nigeria',
  '023': 'Citibank Nigeria',
  '030': 'Heritage Bank',
  '999991': 'OPay',
  '999992': 'PalmPay',
  '999993': 'Kuda',
};

export class AccountModule {
  constructor(private readonly client: ApiClient) {}

  async updateProfile(req: UpdateProfileRequest): Promise<UserMe> {
    // TODO Phase 6+: return this.client.patch('/account/profile', req);
    if (req.displayName !== undefined) {
      mockState.displayName = req.displayName;
    }
    if (req.email !== undefined) {
      mockState.email = req.email;
    }
    return Promise.resolve({ ...mockState });
  }

  async updateNotificationPreferences(
    req: UpdateNotificationPreferencesRequest,
  ): Promise<UserMe> {
    // TODO Phase 6+: return this.client.patch('/account/notifications', req);
    mockState.notificationPreferences = {
      ...mockState.notificationPreferences,
      ...req,
    };
    return Promise.resolve({ ...mockState });
  }

  async updateBankAccount(req: UpdateBankAccountRequest): Promise<UpdateBankAccountResponse> {
    // TODO Phase 6+: return this.client.put('/account/bank', req);
    // Simulate name resolution (Paystack/Flutterwave does this in real life)
    const bankName = NIGERIAN_BANKS[req.bankCode] ?? 'Unknown Bank';
    if (!/^\d{10}$/.test(req.accountNumber)) {
      throw new Error('Account number must be exactly 10 digits.');
    }
    const last4 = req.accountNumber.slice(-4);
    const bankAccount = {
      bankName,
      accountNumber: last4,
      accountName: 'CHIDI OKAFOR', // Mocked — real backend resolves via gateway
    };
    mockState.bankAccount = bankAccount;
    return Promise.resolve({ bankAccount });
  }

  async updateSpendLimit(req: UpdateSpendLimitRequest): Promise<UserMe> {
    // TODO Phase 6+: return this.client.put('/account/spend-limit', req);
    if (req.capNgn < 500) {
      throw new Error('Minimum cap is ₦500.');
    }
    mockState.spendLimit = { period: req.period, capNgn: req.capNgn };
    return Promise.resolve({ ...mockState });
  }

  async removeSpendLimit(_req: RemoveSpendLimitRequest): Promise<UserMe> {
    // TODO Phase 6+: return this.client.delete('/account/spend-limit');
    mockState.spendLimit = null;
    return Promise.resolve({ ...mockState });
  }

  async requestBreak(req: RequestBreakRequest): Promise<RequestBreakResponse> {
    // TODO Phase 6+: return this.client.post('/account/break', req);
    if (req.duration === 'permanent') {
      mockState.selfExclusionUntil = null;
      return Promise.resolve({ selfExclusionUntil: null });
    }
    const days = req.duration === '7d' ? 7 : req.duration === '30d' ? 30 : 180;
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    mockState.selfExclusionUntil = until;
    return Promise.resolve({ selfExclusionUntil: until });
  }

  /** Read the current mock state (used by getMe to stay in sync after mutations). */
  getCurrentMockState(): UserMe {
    return { ...mockState };
  }
}