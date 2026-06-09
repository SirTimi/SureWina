import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditActorType, KycStatus } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CustomerJwtPayload, OtpChallenge } from './auth.types';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  private readonly otpKeyPrefix = 'auth:customer:otp';

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const ttlSeconds = this.configService.get<number>('OTP_TTL_SECONDS') ?? 300;

    const challengeId = randomUUID();
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const challenge: OtpChallenge = {
      challengeId,
      phoneE164: dto.phoneE164,
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
        phoneE164: this.maskPhone(dto.phoneE164),
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      challengeId,
      expiresInSeconds: ttlSeconds,

      // Dev-only. When Termii is connected, remove this from non-dev responses.
      debugOtp:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? undefined
          : otp,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
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

    const accessToken = await this.signCustomerAccessToken({
      sub: user.userId,
      phoneNumber: user.phoneNumber,
      type: 'customer',
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
      },
    });

    return {
      accessToken,
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

  async signOut(userId: string) {
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

  private async signCustomerAccessToken(payload: CustomerJwtPayload) {
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