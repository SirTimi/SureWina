export type AgentOtpChallenge = {
  challengeId: string;
  phoneE164: string;
  agentId: string;
  otpHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
};

export type AgentJwtPayload = {
  sub: string;
  agentCode: string;
  phoneNumber: string;
  type: 'agent';
  sessionId: string;
};

export type AgentRefreshJwtPayload = {
  sub: string;
  type: 'agent_refresh';
  sessionId: string;
};

export type AgentRefreshSession = {
  agentId: string;
  refreshTokenHash: string;
};

export type AgentAuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  agent: {
    agentId: string;
    agentCode: string;
    phoneNumber: string;
    email: string | null;
    fullName: string;
    registeredStateCode: string;
    status: string;
    tier: string;
    commissionRate: string;
    isSuperAgent: boolean;
  };
};