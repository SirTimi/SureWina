import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, KycStatus } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  AuthTokenBundle,
  CustomerJwtPayload,
  CustomerRefreshJwtPayload,
  CustomerRefreshSession,
  OtpChallenge,
} from './auth.types';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { V2nSmsProvider } from '../notifications/v2n-sms.provider';
import { ZohoEmailProvider } from '../notifications/zoho-email.provider';
import { signInCode } from '../notifications/email.templates';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpKeyPrefix = 'auth:customer:otp';
  private readonly refreshSessionKeyPrefix = 'auth:customer:refresh-session';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly sms: V2nSmsProvider,
    private readonly email: ZohoEmailProvider,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    // Resolve to a phone number first: a challenge is always keyed on phone,
    // whichever credential started it, so verify and everything downstream
    // stays identical.
    let phoneE164 = dto.phoneE164;
    const normalizedEmail = dto.email?.trim().toLowerCase();

    if (!phoneE164 && normalizedEmail) {
      const user = await this.prismaService.user.findUnique({
        where: { email: normalizedEmail },
        select: { phoneNumber: true },
      });

      if (!user) {
        // Deliberately explicit rather than silent. An unknown email here is
        // almost always a real customer who hasn't added one yet, and telling
        // them what to do beats a vague failure. The tradeoff — confirming
        // whether an address is registered — is acceptable: the rate limiter
        // caps enumeration, and there's no password to attack.
        throw new NotFoundException(
          'No account uses that email. Sign in with your phone number, then add your email in account settings.',
        );
      }

      phoneE164 = user.phoneNumber;
    }

    if (!phoneE164) {
      throw new BadRequestException('Enter your phone number or email address');
    }

    const ttlSeconds = this.configService.get<number>('OTP_TTL_SECONDS') ?? 300;

    const challengeId = randomUUID();
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const challenge: OtpChallenge = {
      challengeId,
      phoneE164,
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

    // Deliver the code. A send failure is logged, not thrown: the challenge
    // already exists, and surfacing delivery status would tell an attacker
    // which numbers are reachable.
    const delivery = await this.sms.send(
      phoneE164,
      [
        'SUREWINA',
        `OTP: ${otp}`,
        `Expiry: ${Math.round(ttlSeconds / 60)} Mins`,
        'Do not share this code with anyone.',
        'Customer care: 080 8000 9000',
      ].join('\n'),
      `otp-${challengeId}`,
    );

    if (!delivery.sent) {
      this.logger.error(
        `OTP SMS failed for ${this.maskPhone(phoneE164)}: ${delivery.reason ?? 'unknown'}`,
      );
    }

    // Asked by email, answer by email as well as SMS — the whole point of
    // this route is that their SMS may not be arriving.
    if (normalizedEmail) {
      const mail = signInCode(otp, Math.round(ttlSeconds / 60));

      void this.email
        .send({ to: normalizedEmail, ...mail })
        .catch((e) =>
          this.logger.error(
            `Sign-in code email failed: ${e instanceof Error ? e.message : 'unknown'}`,
          ),
        );
    }

    await this.auditService.write({
      actor: {
        type: AuditActorType.CUSTOMER,
      },
      action: 'CUSTOMER_OTP_REQUESTED',
      resource: {
        type: 'OtpChallenge',
        id: challengeId,
      },
      metadata: {
        phoneE164: this.maskPhone(phoneE164),
        // Which credential started it — useful when someone reports that
        // sign-in isn't working and you need to know which route they used.
        via: normalizedEmail ? 'email' : 'phone',
        expiresAt: expiresAt.toISOString(),
        smsSent: delivery.sent,
        smsDevMode: delivery.devMode,
      },
    });

    return {
      challengeId,
      expiresInSeconds: ttlSeconds,
      channel: normalizedEmail ? ('SMS_AND_EMAIL' as const) : ('SMS' as const),
      debugOtp:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? undefined
          : otp,
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthTokenBundle> {
    const key = this.getOtpChallengeKey(dto.challengeId);

    const challenge = await this.redisService.getJson<OtpChallenge>(key);

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

    const user = await this.prismaService.user.upsert({
      where: {
        phoneNumber: challenge.phoneE164,
      },
      create: {
        phoneNumber: challenge.phoneE164,
        kycStatus: KycStatus.OTP_VERIFIED,
      },
      update: {
        kycStatus: KycStatus.OTP_VERIFIED,
      },
    });

    const tokens = await this.issueCustomerTokens({
      userId: user.userId,
      phoneNumber: user.phoneNumber,
    });

    await this.auditService.write({
      actor: {
        type: AuditActorType.CUSTOMER,
        id: user.userId,
      },
      action: 'CUSTOMER_OTP_VERIFIED',
      resource: {
        type: 'User',
        id: user.userId,
      },
      metadata: {
        phoneE164: this.maskPhone(user.phoneNumber),
        refreshSessionId: tokens.sessionId,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
      tokenType: 'Bearer',
      expiresInSeconds: 15 * 60,
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        email: user.email,
        displayName: user.displayName,
        kycStatus: user.kycStatus,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokenBundle> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const payload = await this.verifyRefreshToken(refreshToken);

    const sessionKey = this.getRefreshSessionKey(payload.sessionId);
    const session =
      await this.redisService.getJson<CustomerRefreshSession>(sessionKey);

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Refresh session expired or revoked');
    }

    const incomingTokenHash = this.hashRefreshToken(refreshToken);

    if (incomingTokenHash !== session.refreshTokenHash) {
      await this.redisService.delete(sessionKey);

      await this.auditService.write({
        actor: {
          type: AuditActorType.CUSTOMER,
          id: payload.sub,
        },
        action: 'CUSTOMER_REFRESH_TOKEN_REUSE_DETECTED',
        resource: {
          type: 'RefreshSession',
          id: payload.sessionId,
        },
        metadata: {},
      });

      throw new UnauthorizedException('Invalid refresh session');
    }

    const user = await this.prismaService.user.findUnique({
      where: {
        userId: payload.sub,
      },
    });

    if (!user) {
      await this.redisService.delete(sessionKey);
      throw new UnauthorizedException('User not found');
    }

    await this.redisService.delete(sessionKey);

    const tokens = await this.issueCustomerTokens({
      userId: user.userId,
      phoneNumber: user.phoneNumber,
    });

    await this.auditService.write({
      actor: {
        type: AuditActorType.CUSTOMER,
        id: user.userId,
      },
      action: 'CUSTOMER_REFRESH_TOKEN_ROTATED',
      resource: {
        type: 'RefreshSession',
        id: tokens.sessionId,
      },
      metadata: {
        previousRefreshSessionId: payload.sessionId,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
      tokenType: 'Bearer',
      expiresInSeconds: 15 * 60,
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        email: user.email,
        displayName: user.displayName,
        kycStatus: user.kycStatus,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        userId,
      },
      select: {
        userId: true,
        phoneNumber: true,
        email: true,
        displayName: true,
        kycStatus: true,
        loyaltyPointsBalance: true,
        smsEnabled: true,
        pushEnabled: true,
        emailEnabled: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async signOut(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.verifyRefreshToken(refreshToken);

        if (payload.sub === userId) {
          await this.redisService.delete(
            this.getRefreshSessionKey(payload.sessionId),
          );

          await this.auditService.write({
            actor: {
              type: AuditActorType.CUSTOMER,
              id: userId,
            },
            action: 'CUSTOMER_REFRESH_SESSION_REVOKED',
            resource: {
              type: 'RefreshSession',
              id: payload.sessionId,
            },
            metadata: {},
          });
        }
      } catch {
        // Ignore invalid refresh token during sign-out.
        // The access token already proved the user identity.
      }
    }

    await this.auditService.write({
      actor: {
        type: AuditActorType.CUSTOMER,
        id: userId,
      },
      action: 'CUSTOMER_SIGNED_OUT',
      resource: {
        type: 'User',
        id: userId,
      },
      metadata: {},
    });

    return {
      success: true,
    };
  }

  getRefreshCookieName() {
    return (
      this.configService.get<string>('REFRESH_TOKEN_COOKIE_NAME') ??
      'surewina_refresh_token'
    );
  }

  getRefreshCookieMaxAgeMs() {
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;
    return ttlDays * 24 * 60 * 60 * 1000;
  }

  private async issueCustomerTokens(input: {
    userId: string;
    phoneNumber: string;
  }) {
    const sessionId = randomUUID();
    const ttlDays = this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;
    const ttlSeconds = ttlDays * 24 * 60 * 60;

    const refreshExpiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const accessPayload: CustomerJwtPayload = {
      sub: input.userId,
      phoneNumber: input.phoneNumber,
      type: 'customer',
    };

    const refreshPayload: CustomerRefreshJwtPayload = {
      sub: input.userId,
      phoneNumber: input.phoneNumber,
      type: 'customer_refresh',
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${ttlDays}d`,
      }),
    ]);

    const session: CustomerRefreshSession = {
      sessionId,
      userId: input.userId,
      phoneNumber: input.phoneNumber,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      createdAt: new Date().toISOString(),
      expiresAt: refreshExpiresAt.toISOString(),
    };

    await this.redisService.setJson(
      this.getRefreshSessionKey(sessionId),
      session,
      ttlSeconds,
    );

    return {
      sessionId,
      accessToken,
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload =
        await this.jwtService.verifyAsync<CustomerRefreshJwtPayload>(refreshToken, {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        });

      if (payload.type !== 'customer_refresh') {
        throw new UnauthorizedException('Invalid refresh token type');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
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

  private hashRefreshToken(refreshToken: string) {
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    return createHash('sha256')
      .update(`${refreshToken}:${secret}`)
      .digest('hex');
  }

  private getOtpChallengeKey(challengeId: string) {
    return `${this.otpKeyPrefix}:${challengeId}`;
  }

  private getRefreshSessionKey(sessionId: string) {
    return `${this.refreshSessionKeyPrefix}:${sessionId}`;
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