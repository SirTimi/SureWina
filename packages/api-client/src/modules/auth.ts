import type {
  RequestOtpRequest,
  RequestOtpResponse,
  UserMe,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

export class AuthModule {
  constructor(private readonly client: ApiClient) {}

  async requestOtp(req: RequestOtpRequest): Promise<RequestOtpResponse> {
    return this.client.post<RequestOtpResponse>(
      '/auth/otp/request',
      // Send only what was given: an empty string fails the API's validation,
      // and sending both would make the phone win silently.
      req.email ? { email: req.email } : { phoneE164: req.phoneE164 },
      { skipAuth: true },
    );
  }

  async verifyOtp(req: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    return this.client.post<VerifyOtpResponse>(
      '/auth/otp/verify',
      { challengeId: req.challengeId, otp: req.otp },
      { skipAuth: true },
    );
  }

  async getMe(): Promise<UserMe> {
    return this.client.get<UserMe>('/auth/me');
  }

  async signOut(): Promise<void> {
    await this.client.post('/auth/sign-out', {});
  }
}