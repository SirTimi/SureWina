import type {
  RequestOtpRequest,
  RequestOtpResponse,
  UserMe,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import { MOCK_USER_ME } from './mock-data.js';

const mockChallenges = new Map<string, { phone: string; otp: string; expiresAt: number }>();

export class AuthModule {
  constructor(private readonly client: ApiClient) {}

  async requestOtp(req: RequestOtpRequest): Promise<RequestOtpResponse> {
    // TODO Phase 6+: return this.client.post('/auth/otp/request', req);
    const challengeId = `chal_${Math.random().toString(36).slice(2, 11)}`;
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    mockChallenges.set(challengeId, { phone: req.phoneE164, otp, expiresAt });
    return Promise.resolve({
      challengeId,
      channel: 'SMS',
      expiresAt: new Date(expiresAt).toISOString(),
      mockOtp: otp,
    });
  }

  async verifyOtp(req: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    // TODO Phase 6+: return this.client.post('/auth/otp/verify', req);
    const challenge = mockChallenges.get(req.challengeId);
    const isOverride = req.otp === '000000' || req.otp === '123456';

    if (!challenge && !isOverride) {
      throw new Error('Invalid or expired challenge. Request a new code.');
    }

    if (challenge) {
      if (Date.now() > challenge.expiresAt) {
        mockChallenges.delete(req.challengeId);
        throw new Error('This code has expired. Request a new one.');
      }
      if (!isOverride && challenge.otp !== req.otp) {
        throw new Error('That code is incorrect. Try again.');
      }
      mockChallenges.delete(req.challengeId);
    }

    return Promise.resolve({
      user: {
        userId: MOCK_USER_ME.userId,
        displayName: MOCK_USER_ME.displayName,
        kycStatus: MOCK_USER_ME.kycStatus,
      },
      accessToken: `mock_access_${Math.random().toString(36).slice(2)}`,
      refreshToken: `mock_refresh_${Math.random().toString(36).slice(2)}`,
      isNewUser: false,
    });
  }

  async getMe(): Promise<UserMe> {
    // TODO Phase 6+: return this.client.get('/auth/me');
    return Promise.resolve({ ...MOCK_USER_ME });
  }

  async signOut(): Promise<void> {
    // TODO Phase 6+: return this.client.post('/auth/sign-out');
    return Promise.resolve();
  }
}