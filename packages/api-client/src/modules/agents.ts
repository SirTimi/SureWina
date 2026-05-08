import type {
  AgentMe,
  GetAgentMeResponse,
  RequestAgentOtpRequest,
  RequestAgentOtpResponse,
  VerifyAgentOtpRequest,
  VerifyAgentOtpResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

// Mock agent state — in real backend this is queried from PostgreSQL.
const MOCK_AGENT: AgentMe = {
  agentId: 'agt_emeka_mock_demo_001',
  agentCode: 'RD-AGT-481723',
  phoneNumber: '+2348091234567',
  fullName: 'Emeka Okonkwo',
  email: null,
  registeredStateCode: 'ANA',
  status: 'ACTIVE',
  tier: 'SILVER',
  commissionRate: 0.1,
  isSuperAgent: false,
  superAgentCode: null,
  trainingCompletedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  agentAgreementSignedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  monthlyTicketCount: 287,
  remittanceOwedNgn: 24500,
  nextRemittanceDeadlineAt: getEndOfDayWat(),
  remittanceOverdue: false,
  bankAccount: {
    bankName: 'Guaranty Trust Bank',
    accountNumber: '4567',
    accountName: 'EMEKA OKONKWO',
  },
  createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
};

let mockAgentState: AgentMe = { ...MOCK_AGENT };

function getEndOfDayWat(): string {
  const d = new Date();
  d.setHours(23, 0, 0, 0); // 23:00 WAT remittance cutoff
  return d.toISOString();
}

const mockAgentChallenges = new Map<
  string,
  { phone: string; otp: string; expiresAt: number }
>();

export class AgentsModule {
  constructor(private readonly client: ApiClient) {}

  async requestOtp(req: RequestAgentOtpRequest): Promise<RequestAgentOtpResponse> {
    // TODO Phase 6+: return this.client.post('/agents/auth/otp/request', req);
    const challengeId = `acl_${Math.random().toString(36).slice(2, 11)}`;
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    mockAgentChallenges.set(challengeId, { phone: req.phoneE164, otp, expiresAt });
    return Promise.resolve({
      challengeId,
      channel: 'SMS',
      expiresAt: new Date(expiresAt).toISOString(),
      mockOtp: otp,
    });
  }

  async verifyOtp(req: VerifyAgentOtpRequest): Promise<VerifyAgentOtpResponse> {
    // TODO Phase 6+: return this.client.post('/agents/auth/otp/verify', req);
    const challenge = mockAgentChallenges.get(req.challengeId);
    const isOverride = req.otp === '000000' || req.otp === '123456';

    if (!challenge && !isOverride) {
      throw new Error('Invalid or expired challenge.');
    }

    if (challenge) {
      if (Date.now() > challenge.expiresAt) {
        mockAgentChallenges.delete(req.challengeId);
        throw new Error('This code has expired. Request a new one.');
      }
      if (!isOverride && challenge.otp !== req.otp) {
        throw new Error('That code is incorrect. Try again.');
      }
      mockAgentChallenges.delete(req.challengeId);
    }

    return Promise.resolve({
      agent: { ...mockAgentState },
      accessToken: `mock_agent_access_${Math.random().toString(36).slice(2)}`,
      refreshToken: `mock_agent_refresh_${Math.random().toString(36).slice(2)}`,
      isFirstSignIn: false,
    });
  }

  async getMe(): Promise<GetAgentMeResponse> {
    // TODO Phase 6+: return this.client.get('/agents/me');
    return Promise.resolve({ agent: { ...mockAgentState } });
  }

  async signOut(): Promise<void> {
    return Promise.resolve();
  }

  /** Internal helper for other modules — get the live mutable state. */
  getCurrentMockState(): AgentMe {
    return { ...mockAgentState };
  }

  /** Internal helper — used by sale module to update remittance owed. */
  _updateMockState(patch: Partial<AgentMe>): void {
    Object.assign(mockAgentState, patch);
  }
}