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
  AgentJwtPayload,
  AgentOtpChallenge,
} from './agent-auth.types';
import { Logger } from '@nestjs/common'
import { V2nSmsProvider } from '../notifications/v2n-sms.provider'

@Injectable()
export class AgentAuthService {
  private readonly otpKeyPrefix = 'auth:agent:otp';
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
    const agent = await this.prismaService.agent.findUnique({
      where: {
        phoneNumber: dto.phoneE164,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Agent not found');
    }

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
      phoneE164: dto.phoneE164,
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
      dto.phoneE164,
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

    if (
      agent.status === AgentStatus.SUSPENDED ||
      agent.status === AgentStatus.TERMINATED
    ) {
      throw new ForbiddenException('Agent account is not allowed to sign in');
    }

    const accessToken = await this.signAgentAccessToken({
      sub: agent.agentId,
      agentCode: agent.agentCode,
      phoneNumber: agent.phoneNumber,
      type: 'agent',
    });

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
      accessToken,
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