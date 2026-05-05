import type {
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '../../../types/src/api';
import type { ApiClient } from '../client.js';

// In-memory mock OTP store. Real backend uses Redis with TTL.
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
      // In real life this is never returned. Mocks expose it for testing.
      mockOtp: otp,
    });
  }

  async verifyOtp(req: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    // TODO Phase 6+: return this.client.post('/auth/otp/verify', req);
    const challenge = mockChallenges.get(req.challengeId);

    // For mock convenience: also accept literal "000000" or "123456" as override codes
    // so testers don't have to look at the network tab every time.
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

    const phone = challenge?.phone ?? '+2348000000000';
    const isNewUser = Math.random() > 0.5; // Mock: random for testing both paths

    return Promise.resolve({
      user: {
        userId: `usr_${Math.random().toString(36).slice(2, 11)}`,
        displayName: null,
        kycStatus: 'OTP_VERIFIED',
      },
      accessToken: `mock_access_${Math.random().toString(36).slice(2)}`,
      refreshToken: `mock_refresh_${Math.random().toString(36).slice(2)}`,
      isNewUser,
    });
  }
}