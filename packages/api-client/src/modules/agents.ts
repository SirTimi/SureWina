import type {
  GetAgentMeResponse,
  RequestAgentOtpRequest,
  RequestAgentOtpResponse,
  VerifyAgentOtpRequest,
  VerifyAgentOtpResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

export class AgentsModule {
  constructor(private readonly client: ApiClient) {}

  async requestOtp(req: RequestAgentOtpRequest): Promise<RequestAgentOtpResponse> {
    return this.client.post<RequestAgentOtpResponse>(
      '/agents/auth/otp/request',
      { phoneE164: req.phoneE164 },
      { skipAuth: true },
    );
  }

  async verifyOtp(req: VerifyAgentOtpRequest): Promise<VerifyAgentOtpResponse> {
    return this.client.post<VerifyAgentOtpResponse>(
      '/agents/auth/otp/verify',
      { challengeId: req.challengeId, otp: req.otp },
      { skipAuth: true },
    );
  }

  async getMe(): Promise<GetAgentMeResponse> {
    // Backend route lives under the auth controller: /agents/auth/me
    return this.client.get<GetAgentMeResponse>('/agents/auth/me');
  }

  async signOut(): Promise<void> {
    await this.client.post('/agents/auth/sign-out', {}).catch(() => undefined);
  }
}