import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AgentStatus, AuditActorType } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { RequestOtpDto } from '../auth/dto/request-otp.dto';
import { VerifyOtpDto } from '../auth/dto/verify-otp.dto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  AgentAuthResponse,
  AgentRefreshJwtPayload,
  AgentRefreshSession,
  AgentJwtPayload,
  AgentOtpChallenge,
} from './agent-auth.types';
import { Logger } from '@nestjs/common'
import { V2nSmsProvider } from '../notifications/v2n-sms.provider'

const RETIRED_DEBT_SUSPENSION_REASON = 'UNSETTLED_REMITTANCE';

@Injectable()
export class AgentAuthService {
  private readonly otpKeyPrefix = 'auth:agent:otp';
  private readonly refreshKeyPrefix = 'auth:agent:refresh-session';
  private readonly logger = new Logger(AgentAuthService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly sms: V2nSmsProvider
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    // Agents sign in by phone only: the number is verified at in-office
    // onboarding and is how the platform identifies them. The shared DTO
    // allows email for customers, so narrow it here.
    const phoneE164 = dto.phoneE164;
    if (!phoneE164) {
      throw new BadRequestException('Enter your registered phone number');
    }

    const agent = await this.prismaService.agent.findUnique({
      where: {
        phoneNumber: phoneE164,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Agent not found');
    }

    await this.reactivateRetiredDebtSuspension(agent);

    if (
      agent.status === AgentStatus.SUSPENDED ||
      agent.status === AgentStatus.TERMINATED
    ) {
      throw new ForbiddenException('Agent account is not allowed to sign in');
    }

    const ttlSeconds = this.configService.get<number>('OTP_TTL_SECONDS') ?? 300;

    const challengeId = randomUUID();
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const challenge: AgentOtpChallenge = {
      challengeId,
      phoneE164,
      agentId: agent.agentId,
      otpHash,
      attempts: 0,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.redisService.setJson(
      this.getOtpChallengeKey(challengeId),
      challenge,
      ttlSeconds,
    );

    const delivery = await this.sms.send(
      phoneE164,
      [
        'SUREWINA AGENT',
        `OTP: ${otp}`,
        `Expiry: ${Math.round(ttlSeconds / 60)} Mins`,
        'Do not share this code with anyone.',
        'Customer care: 080 8000 9000',
      ].join('\n'),
      `agent-otp-${challengeId}`,
    );

    if (!delivery.sent) {
      this.logger.error(`Agent OTP SMS failed: ${delivery.reason ?? 'unknown'}`);
    }

    await this.auditService.write({
      actor: {
        type: AuditActorType.AGENT,
        id: agent.agentId,
      },
      action: 'AGENT_OTP_REQUESTED',
      resource: {
        type: 'Agent',
        id: agent.agentId,
      },
      metadata: {
        challengeId,
        phoneE164: this.maskPhone(agent.phoneNumber),
        status: agent.status,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      challengeId,
      expiresInSeconds: ttlSeconds,
      channel: 'SMS' as const,
      expiresAt: expiresAt.toISOString(),
      debugOtp:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? undefined
          : otp,
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AgentAuthResponse> {
    const key = this.getOtpChallengeKey(dto.challengeId);

    const challenge = await this.redisService.getJson<AgentOtpChallenge>(key);

    if (!challenge) {
      throw new BadRequestException('OTP challenge expired or not found');
    }

    if (challenge.attempts >= 5) {
      await this.redisService.delete(key);
      throw new UnauthorizedException('Too many OTP attempts');
    }

    const incomingHash = this.hashOtp(dto.otp);

    if (incomingHash !== challenge.otpHash) {
      challenge.attempts += 1;

      const remainingTtlSeconds = this.getRemainingTtlSeconds(challenge.expiresAt);

      if (remainingTtlSeconds > 0) {
        await this.redisService.setJson(key, challenge, remainingTtlSeconds);
      }

      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redisService.delete(key);

    const agent = await this.prismaService.agent.findUnique({
      where: {
        agentId: challenge.agentId,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Agent not found');
    }

    await this.reactivateRetiredDebtSuspension(agent);

    if (
      agent.status === AgentStatus.SUSPENDED ||
      agent.status === AgentStatus.TERMINATED
    ) {
      throw new ForbiddenException('Agent account is not allowed to sign in');
    }

    const tokens = await this.issueAgentTokens(agent);

    await this.auditService.write({
      actor: {
        type: AuditActorType.AGENT,
        id: agent.agentId,
      },
      action: 'AGENT_OTP_VERIFIED',
      resource: {
        type: 'Agent',
        id: agent.agentId,
      },
      metadata: {
        phoneE164: this.maskPhone(agent.phoneNumber),
        status: agent.status,
      },
    });

    return {
      ...tokens,
      tokenType: 'Bearer',
      expiresInSeconds: 15 * 60,
      agent: {
        agentId: agent.agentId,
        agentCode: agent.agentCode,
        phoneNumber: agent.phoneNumber,
        email: agent.email,
        fullName: agent.fullName,
        registeredStateCode: agent.registeredStateCode,
        status: agent.status,
        tier: agent.tier,
        commissionRate: agent.commissionRate.toString(),
        isSuperAgent: agent.isSuperAgent,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AgentAuthResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const payload = await this.verifyAgentRefreshToken(refreshToken);
    const sessionKey = this.getAgentRefreshKey(payload.sessionId);
    // GETDEL consumes the old session atomically. Two simultaneous refresh
    // calls cannot both mint new credentials from the same token.
    const raw = await this.redisService.getClient().getdel(sessionKey);
    if (!raw) {
      throw new UnauthorizedException('Refresh session expired or revoked');
    }

    let session: AgentRefreshSession;
    try {
      session = JSON.parse(raw) as AgentRefreshSession;
    } catch {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (
      session.agentId !== payload.sub ||
      session.refreshTokenHash !== this.hashRefreshToken(refreshToken)
    ) {
      await this.auditService.write({
        actor: { type: AuditActorType.AGENT, id: payload.sub },
        action: 'AGENT_REFRESH_TOKEN_REUSE_DETECTED',
        resource: { type: 'RefreshSession', id: payload.sessionId },
        metadata: {},
      });
      throw new UnauthorizedException('Invalid refresh session');
    }

    const agent = await this.prismaService.agent.findUnique({
      where: { agentId: payload.sub },
    });

    if (!agent || agent.status === AgentStatus.SUSPENDED || agent.status === AgentStatus.TERMINATED) {
      throw new UnauthorizedException('Agent is not allowed to sign in');
    }

    const tokens = await this.issueAgentTokens(agent);
    await this.auditService.write({
      actor: { type: AuditActorType.AGENT, id: agent.agentId },
      action: 'AGENT_REFRESH_TOKEN_ROTATED',
      resource: { type: 'RefreshSession', id: payload.sessionId },
      metadata: {},
    });

    return {
      ...tokens,
      tokenType: 'Bearer',
      expiresInSeconds: 15 * 60,
      agent: {
        agentId: agent.agentId,
        agentCode: agent.agentCode,
        phoneNumber: agent.phoneNumber,
        email: agent.email,
        fullName: agent.fullName,
        registeredStateCode: agent.registeredStateCode,
        status: agent.status,
        tier: agent.tier,
        commissionRate: agent.commissionRate.toString(),
        isSuperAgent: agent.isSuperAgent,
      },
    };
  }

  async signOut(agentId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.verifyAgentRefreshToken(refreshToken);
        if (payload.sub === agentId) {
          await this.redisService.delete(this.getAgentRefreshKey(payload.sessionId));
        }
      } catch {
        // Invalid/expired refresh tokens do not prevent local sign-out.
      }
    }

    await this.auditService.write({
      actor: { type: AuditActorType.AGENT, id: agentId },
      action: 'AGENT_SIGNED_OUT',
      resource: { type: 'Agent', id: agentId },
      metadata: {},
    });
    return { success: true };
  }

  private async issueAgentTokens(agent: { agentId: string; agentCode: string; phoneNumber: string }) {
    const sessionId = randomUUID();
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;
    const ttlSeconds = ttlDays * 24 * 60 * 60;
    const [accessToken, refreshToken] = await Promise.all([
      this.signAgentAccessToken({
        sub: agent.agentId,
        agentCode: agent.agentCode,
        phoneNumber: agent.phoneNumber,
        type: 'agent',
        sessionId,
      }),
      this.jwtService.signAsync(
        { sub: agent.agentId, type: 'agent_refresh', sessionId } satisfies AgentRefreshJwtPayload,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: `${ttlDays}d`,
        },
      ),
    ]);
    await this.redisService.setJson<AgentRefreshSession>(
      this.getAgentRefreshKey(sessionId),
      { agentId: agent.agentId, refreshTokenHash: this.hashRefreshToken(refreshToken) },
      ttlSeconds,
    );
    return { accessToken, refreshToken };
  }

  private async verifyAgentRefreshToken(token: string): Promise<AgentRefreshJwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AgentRefreshJwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'agent_refresh' || !payload.sessionId) {
        throw new UnauthorizedException('Invalid refresh token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private hashRefreshToken(token: string) {
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    return createHash('sha256').update(`${token}:${secret}`).digest('hex');
  }

  private getAgentRefreshKey(sessionId: string) {
    return `${this.refreshKeyPrefix}:${sessionId}`;
  }

  async getMe(agentId: string) {
    const agent = await this.prismaService.agent.findUnique({
      where: {
        agentId,
      },
      select: {
        agentId: true,
        agentCode: true,
        phoneNumber: true,
        email: true,
        fullName: true,
        registeredStateCode: true,
        status: true,
        tier: true,
        commissionRate: true,
        isSuperAgent: true,
        superAgentCode: true,
        monthlyTicketCount: true,
        trainingCompletedAt: true,
        agentAgreementSignedAt: true,
        createdAt: true,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Agent not found');
    }

    return {
      ...agent,
      commissionRate: agent.commissionRate.toString(),
    };
  }

  private async reactivateRetiredDebtSuspension(
    agent: {
      agentId: string;
      agentCode: string;
      status: AgentStatus;
      suspensionReason: string | null;
      suspendedAt: Date | null;
    },
  ) {
    if (
      agent.status !== AgentStatus.SUSPENDED ||
      agent.suspensionReason !== RETIRED_DEBT_SUSPENSION_REASON
    ) {
      return;
    }

    const reactivated = await this.prismaService.agent.updateMany({
      where: {
        agentId: agent.agentId,
        status: AgentStatus.SUSPENDED,
        suspensionReason: RETIRED_DEBT_SUSPENSION_REASON,
      },
      data: {
        status: AgentStatus.ACTIVE,
        suspensionReason: null,
        suspendedAt: null,
      },
    });

    if (reactivated.count === 0) {
      const current = await this.prismaService.agent.findUnique({
        where: { agentId: agent.agentId },
        select: {
          status: true,
          suspensionReason: true,
          suspendedAt: true,
        },
      });

      if (current) {
        agent.status = current.status;
        agent.suspensionReason = current.suspensionReason;
        agent.suspendedAt = current.suspendedAt;
      }

      return;
    }

    agent.status = AgentStatus.ACTIVE;
    agent.suspensionReason = null;
    agent.suspendedAt = null;

    await this.auditService.write({
      actor: {
        type: AuditActorType.SYSTEM,
      },
      action: 'AGENT_REACTIVATED_DEBT_SUSPENSION_RETIRED',
      resource: {
        type: 'Agent',
        id: agent.agentId,
      },
      metadata: {
        agentCode: agent.agentCode,
        retiredReason: RETIRED_DEBT_SUSPENSION_REASON,
        source: 'AGENT_AUTH',
        remittancesPreserved: true,
        settlementModel: 'PREPAID_WALLET',
      },
    });
  }

  private async signAgentAccessToken(payload: AgentJwtPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  private generateOtp() {
    return String(randomInt(100000, 1000000));
  }

  private hashOtp(otp: string) {
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    return createHash('sha256')
      .update(`${otp}:${secret}`)
      .digest('hex');
  }

  private getOtpChallengeKey(challengeId: string) {
    return `${this.otpKeyPrefix}:${challengeId}`;
  }

  private getRemainingTtlSeconds(expiresAt: string) {
    const expiresAtMs = new Date(expiresAt).getTime();
    const nowMs = Date.now();

    return Math.max(Math.floor((expiresAtMs - nowMs) / 1000), 0);
  }

  private maskPhone(phone: string) {
    if (phone.length <= 6) {
      return phone;
    }

    return `${phone.slice(0, 4)}****${phone.slice(-4)}`;
  }
}