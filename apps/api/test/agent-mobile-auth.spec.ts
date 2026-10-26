import { AgentStatus } from '@prisma/client';
import { AgentAuthService } from '../src/agent-auth/agent-auth.service';
import { AgentJwtGuard } from '../src/agent-auth/guards/agent-jwt.guard';

const agent = {
  agentId: 'agent-1',
  agentCode: 'AG-0001',
  phoneNumber: '+2348012345678',
  email: null,
  fullName: 'Pilot Agent',
  registeredStateCode: 'LA',
  status: AgentStatus.ACTIVE as AgentStatus,
  tier: 'BRONZE',
  commissionRate: { toString: () => '0.1' },
  isSuperAgent: false,
};

function buildHarness() {
  const cache = new Map<string, string>();
  const redis = {
    setJson: jest.fn(async (key: string, value: unknown) => {
      cache.set(key, JSON.stringify(value));
    }),
    getJson: jest.fn(async (key: string) => {
      const value = cache.get(key);
      return value ? JSON.parse(value) : null;
    }),
    delete: jest.fn(async (key: string) => { cache.delete(key); }),
    getClient: () => ({
      getdel: async (key: string) => {
        const value = cache.get(key) ?? null;
        cache.delete(key);
        return value;
      },
    }),
  };
  const jwt = {
    signAsync: jest.fn(async (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64')),
    verifyAsync: jest.fn(async (token: string) => JSON.parse(Buffer.from(token, 'base64').toString())),
  };
  const audit = { write: jest.fn(async () => undefined) };
  const prisma = { agent: { findUnique: jest.fn(async () => ({ ...agent })) } };
  const config = {
    get: jest.fn((key: string) => key === 'OTP_TTL_SECONDS' ? 300 : key === 'REFRESH_TOKEN_TTL_DAYS' ? 30 : 'test'),
    getOrThrow: jest.fn((key: string) => key === 'JWT_REFRESH_SECRET' ? 'test-refresh-secret' : 'test-access-secret'),
  };
  const sms = { send: jest.fn(async () => ({ sent: true })) };
  const service = new AgentAuthService(
    config as never, jwt as never, prisma as never, redis as never, audit as never, sms as never,
  );
  return { service, redis, prisma, jwt, audit, cache, config };
}

describe('agent mobile session contract', () => {
  it('issues an OTP challenge and a 15-minute access token with a revocable refresh session', async () => {
    const { service, cache } = buildHarness();
    const challenge = await service.requestOtp({ phoneE164: agent.phoneNumber } as never);
    expect(challenge.channel).toBe('SMS');
    expect(challenge.expiresInSeconds).toBe(300);
    expect(challenge.debugOtp).toMatch(/^\d{6}$/);
    const verified = await service.verifyOtp({ challengeId: challenge.challengeId, otp: challenge.debugOtp! });
    expect(verified.expiresInSeconds).toBe(900);
    expect(verified.agent.agentCode).toBe(agent.agentCode);
    expect(verified.accessToken).toEqual(expect.any(String));
    expect(verified.refreshToken).toEqual(expect.any(String));
    expect([...cache.keys()].filter((k) => k.startsWith('auth:agent:refresh-session:'))).toHaveLength(1);
  });

  it('rotates refresh tokens once and rejects replay', async () => {
    const { service } = buildHarness();
    const challenge = await service.requestOtp({ phoneE164: agent.phoneNumber } as never);
    const first = await service.verifyOtp({ challengeId: challenge.challengeId, otp: challenge.debugOtp! });
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toThrow();
    const third = await service.refresh(second.refreshToken);
    expect(third.accessToken).toEqual(expect.any(String));
  });

  it('revokes refresh session on sign-out', async () => {
    const { service } = buildHarness();
    const challenge = await service.requestOtp({ phoneE164: agent.phoneNumber } as never);
    const first = await service.verifyOtp({ challengeId: challenge.challengeId, otp: challenge.debugOtp! });
    expect(await service.signOut(agent.agentId, first.refreshToken)).toEqual({ success: true });
    await expect(service.refresh(first.refreshToken)).rejects.toThrow();
  });

  it('rejects suspended agents at refresh even with a previously valid token', async () => {
    const { service, prisma } = buildHarness();
    const challenge = await service.requestOtp({ phoneE164: agent.phoneNumber } as never);
    const first = await service.verifyOtp({ challengeId: challenge.challengeId, otp: challenge.debugOtp! });
    prisma.agent.findUnique.mockResolvedValueOnce({ ...agent, status: AgentStatus.SUSPENDED });
    await expect(service.refresh(first.refreshToken)).rejects.toThrow();
  });
});


describe('agent JWT session enforcement', () => {
  it('requires an existing refresh session even for a cryptographically valid access token', async () => {
    const { service, jwt, config, redis, prisma } = buildHarness();
    const challenge = await service.requestOtp({ phoneE164: agent.phoneNumber } as never);
    const signedIn = await service.verifyOtp({ challengeId: challenge.challengeId, otp: challenge.debugOtp! });
    const guard = new AgentJwtGuard(jwt as never, config as never, redis as never, prisma as never);
    const request = { headers: { authorization: 'Bearer ' + signedIn.accessToken } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    await service.signOut(agent.agentId, signedIn.refreshToken);
    await expect(guard.canActivate(context as never)).rejects.toThrow();
  });
});
