
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  KycIdentityCheckStatus,
  PrizeClaimStatus,
  PrizePayoutStatus,
  VerifiedPayoutAccountStatus,
} from '@prisma/client';

import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { V2nSmsProvider } from '../notifications/v2n-sms.provider';
import { KycIdentityEvidenceService } from '../claims/kyc/kyc-identity-evidence.service';
import { AuditService } from '../audit/audit.service';

const OTP_TTL_SECONDS = 300;
const GRANT_TTL_SECONDS = 300;
const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;

const IN_FLIGHT: PrizePayoutStatus[] = [
  PrizePayoutStatus.REQUESTED,
  PrizePayoutStatus.SUBMITTED,
  PrizePayoutStatus.PROCESSING,
  PrizePayoutStatus.UNKNOWN,
];

type Challenge = {
  userId: string;
  claimId: string;
  fingerprint: string;
  digest: string;
  attempts: number;
};

type Grant = {
  userId: string;
  claimId: string;
  fingerprint: string;
};

@Injectable()
export class BankChangeStepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sms: V2nSmsProvider,
    private readonly config: ConfigService,
    private readonly evidence: KycIdentityEvidenceService,
    private readonly audit: AuditService,
  ) {}

  // --------------------------------------------------
  // SECURITY KEY
  // --------------------------------------------------

  private secret(): Buffer {
    const encoded = this.config
      .get<string>('PAYOUT_ACCOUNT_ENCRYPTION_KEY')
      ?.trim();

    if (
      !encoded ||
      !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
    ) {
      throw new ServiceUnavailableException(
        'Bank account security is not configured',
      );
    }

    const key = Buffer.from(encoded, 'base64');

    if (
      key.length !== 32 ||
      key.toString('base64') !== encoded
    ) {
      throw new ServiceUnavailableException(
        'Invalid bank account security configuration',
      );
    }

    // Derive a separate purpose-specific key.
    return createHmac('sha256', key)
      .update('surewina:bank-change-step-up:v1')
      .digest();
  }

  private digest(value: string): string {
    return createHmac('sha256', this.secret())
      .update(value)
      .digest('hex');
  }

  private challengeKey(id: string): string {
    return `surewina:bank-change:challenge:${id}`;
  }

  private grantKey(token: string): string {
    return `surewina:bank-change:grant:${this.digest(token)}`;
  }

  // --------------------------------------------------
  // BLOCK UNRESOLVED PAYOUTS
  // --------------------------------------------------

  async assertNoUnresolvedPayouts(
    phoneNumber: string,
  ): Promise<void> {
    const [attempt, legacy] = await Promise.all([
      this.prisma.prizePayoutAttempt.findFirst({
        where: {
          claim: {
            winnerPhone: phoneNumber,
          },
          status: {
            in: IN_FLIGHT,
          },
        },
        select: {
          attemptId: true,
        },
      }),

      this.prisma.prizeClaim.findFirst({
        where: {
          winnerPhone: phoneNumber,
          payoutStatus: {
            in: IN_FLIGHT,
          },
        },
        select: {
          claimId: true,
        },
      }),
    ]);

    if (attempt || legacy) {
      throw new ConflictException(
        'An unresolved payout must be reconciled before changing bank accounts',
      );
    }
  }

  // --------------------------------------------------
  // REQUEST BANK CHANGE OTP
  // --------------------------------------------------

  async request(
    claimId: string,
    userId: string,
    phoneNumber: string,
    bankCode: string,
    accountNumber: string,
  ) {
    // Resolve ownership first.
    const [claim, user] = await Promise.all([
      this.prisma.prizeClaim.findUnique({
        where: { claimId },
      }),

      this.prisma.user.findUnique({
        where: { phoneNumber },
        select: { userId: true },
      }),
    ]);

    // Never access claim fields before confirming
    // that the record exists and belongs to the user.
    if (
      !claim ||
      !user ||
      user.userId !== userId ||
      claim.winnerPhone !== phoneNumber ||
      (
        claim.winnerUserId &&
        claim.winnerUserId !== userId
      )
    ) {
      throw new NotFoundException(
        'Eligible claim not found',
      );
    }

    const latestIdentity =
      await this.prisma.kycIdentityCheck.findFirst({
        where: { claimId },
        orderBy: {
          attemptNumber: 'desc',
        },
      });

    // First bank replacement:
    // the claim must already be KYC cleared.
    const initialChangeEligible =
      claim.status === PrizeClaimStatus.KYC_CLEARED &&
      latestIdentity?.status ===
        KycIdentityCheckStatus.VERIFIED &&
      !!latestIdentity.verifiedAt;

    // Retry after a definitively failed bank change:
    // the prior attempt must have been explicitly
    // authorized using bank-change step-up.
    const retryingFailedChange =
      claim.status === PrizeClaimStatus.KYC_PENDING &&
      latestIdentity?.status ===
        KycIdentityCheckStatus.FAILED &&
      !!latestIdentity.bankChangeAuthorizedAt;

    if (
      claim.claimType !== ClaimType.CASH ||
      (
        !initialChangeEligible &&
        !retryingFailedChange
      ) ||
      claim.payoutStatus !== null ||
      claim.payoutReference !== null ||
      claim.paidByAgentId !== null
    ) {
      throw new ConflictException(
        'This claim is not eligible for a bank-account change',
      );
    }

    // A bank change cannot be used to redirect
    // an existing payout attempt, even if it failed.
    const previousAttempt =
      await this.prisma.prizePayoutAttempt.findFirst({
        where: { claimId },
        select: {
          attemptId: true,
        },
      });

    if (previousAttempt) {
      throw new ConflictException(
        'Bank account cannot be changed after a payout attempt',
      );
    }

    // Reject bank changes while any payout belonging
    // to this customer remains unresolved.
    await this.assertNoUnresolvedPayouts(phoneNumber);

    // Require a properly approved and locked account.
    const approved =
      await this.prisma.verifiedPayoutAccount.findFirst({
        where: {
          userId,
          status: VerifiedPayoutAccountStatus.LOCKED,
          verifiedAt: {
            not: null,
          },
          lockedAt: {
            not: null,
          },
          revokedAt: null,
        },
      });

    if (!approved) {
      throw new ConflictException(
        'No existing locked payout account is available for replacement',
      );
    }

    // A user cannot start another change while
    // a previous replacement is still pending.
    const pending =
      await this.prisma.verifiedPayoutAccount.findFirst({
        where: {
          userId,
          status: VerifiedPayoutAccountStatus.PENDING,
        },
        select: {
          payoutAccountId: true,
        },
      });

    if (pending) {
      throw new ConflictException(
        'Another bank verification is already pending',
      );
    }

    // Fingerprint the COMPLETE bank destination.
    const fingerprint =
      this.evidence.fingerprintAccount(
        bankCode,
        accountNumber,
      );

    if (
      approved.bankCode === bankCode &&
      approved.accountFingerprint === fingerprint
    ) {
      throw new BadRequestException(
        'The new bank account must be different',
      );
    }

    // --------------------------------------------------
    // RATE LIMIT OTP REQUESTS
    // --------------------------------------------------

    const rateKey =
      `surewina:bank-change:rate:${userId}`;

    const rate = await this.redis.increment(rateKey);

    if (rate === 1) {
      await this.redis.expire(rateKey, 3600);
    }

    if (rate > MAX_REQUESTS_PER_HOUR) {
      throw new HttpException(
        'Too many bank-change requests. Try again later.',
        429,
      );
    }

    // --------------------------------------------------
    // GENERATE OTP
    // --------------------------------------------------

    const challengeId = randomUUID();

    const otp = String(
      randomInt(0, 1_000_000),
    ).padStart(6, '0');

    const challenge: Challenge = {
      userId,
      claimId,
      fingerprint,
      digest: this.digest(`${challengeId}:${otp}`),
      attempts: 0,
    };

    const key = this.challengeKey(challengeId);

    // Store only an HMAC digest, not the raw OTP.
    await this.redis.setJson(
      key,
      challenge,
      OTP_TTL_SECONDS,
    );

    // --------------------------------------------------
    // SEND OTP
    // --------------------------------------------------

    let delivered = false;

    try {
      const delivery = await this.sms.send(
        phoneNumber,
        [
          'SUREWINA',
          `Bank change code: ${otp}`,
          'Valid for 5 minutes.',
          'Do not share this code.',
          'If you did not request this, contact support.',
        ].join('\n'),
        `bank-change-${challengeId}`,
      );

      delivered =
        delivery.sent &&
        !(
          this.config.get<string>('NODE_ENV') ===
            'production' &&
          delivery.devMode
        );
    } catch {
      delivered = false;
    }

    if (!delivered) {
      // SMS failed. The challenge must not
      // remain usable in Redis.
      await this.redis.delete(key);

      throw new ServiceUnavailableException(
        'Bank-change verification could not be delivered',
      );
    }

    // --------------------------------------------------
    // AUDIT REQUEST
    // --------------------------------------------------

    try {
      await this.audit.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.CUSTOMER,
          id: userId,
        },
        action: 'PAYOUT_BANK_CHANGE_OTP_REQUESTED',
        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },
        metadata: {
          challengeId,
          bankCode,
          accountLast4: accountNumber.slice(-4),
        },
      });
    } catch {
      // Fail closed if the security audit cannot be
      // written. Never leave an unaudited challenge.
      await this.redis.delete(key);

      throw new ServiceUnavailableException(
        'Bank-change authorization is temporarily unavailable',
      );
    }

    return {
      challengeId,
      expiresInSeconds: OTP_TTL_SECONDS,
      channel: 'SMS' as const,
    };
  }

  // --------------------------------------------------
  // VERIFY BANK CHANGE OTP
  // --------------------------------------------------

  async verify(
    claimId: string,
    userId: string,
    challengeId: string,
    otp: string,
  ) {
    if (
      !/^[0-9a-f-]{36}$/i.test(challengeId) ||
      !/^\d{6}$/.test(otp)
    ) {
      throw new BadRequestException(
        'Invalid verification details',
      );
    }

    const digest = this.digest(
      `${challengeId}:${otp}`,
    );

    // Atomic Redis operation:
    // - check challenge owner and claim
    // - count failed attempts
    // - invalidate after five failures
    // - delete challenge on successful verification
    //
    // Prevents simultaneous requests from reusing
    // the same valid OTP.
    const script = `
      local raw = redis.call('GET', KEYS[1])
      if not raw then
        return ''
      end

      local data = cjson.decode(raw)

      if data.userId ~= ARGV[1]
        or data.claimId ~= ARGV[2] then
        return ''
      end

      if data.attempts >= 5 then
        redis.call('DEL', KEYS[1])
        return ''
      end

      if data.digest ~= ARGV[3] then
        data.attempts = data.attempts + 1

        if data.attempts >= 5 then
          redis.call('DEL', KEYS[1])
        else
          redis.call(
            'SET',
            KEYS[1],
            cjson.encode(data),
            'KEEPTTL'
          )
        end

        return ''
      end

      redis.call('DEL', KEYS[1])
      return data.fingerprint
    `;

    const fingerprint =
      await this.redis.getClient().eval(
        script,
        1,
        this.challengeKey(challengeId),
        userId,
        claimId,
        digest,
      );

    if (
      typeof fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(fingerprint)
    ) {
      throw new UnauthorizedException(
        'Invalid or expired bank-change code',
      );
    }

    // --------------------------------------------------
    // AUDIT SUCCESSFUL VERIFICATION
    // --------------------------------------------------

    // Record successful step-up before issuing
    // a reusable-in-the-next-request authorization.
    // An audit failure leaves no valid grant.
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: {
        type: AuditActorType.CUSTOMER,
        id: userId,
      },
      action: 'PAYOUT_BANK_CHANGE_STEP_UP_VERIFIED',
      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },
      metadata: {
        challengeId,
      },
    });

    // --------------------------------------------------
    // ISSUE SINGLE-USE BANK CHANGE GRANT
    // --------------------------------------------------

    const token = randomBytes(32).toString('hex');

    const grant: Grant = {
      userId,
      claimId,
      fingerprint,
    };

    // Never store the grant token directly.
    // The Redis key contains its HMAC digest.
    await this.redis.setJson(
      this.grantKey(token),
      grant,
      GRANT_TTL_SECONDS,
    );

    return {
      bankChangeGrant: token,
      expiresInSeconds: GRANT_TTL_SECONDS,
    };
  }

  // --------------------------------------------------
  // CONSUME SINGLE-USE AUTHORIZATION
  // --------------------------------------------------

  async consume(
    userId: string,
    claimId: string,
    fingerprint: string,
    token?: string,
  ): Promise<void> {
    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      throw new UnauthorizedException(
        'Fresh bank-change authorization is required',
      );
    }

    const key = this.grantKey(token);

    // GETDEL is atomic.
    // A grant can be consumed exactly once.
    const raw =
      await this.redis.getClient().eval(
        `return redis.call('GETDEL', KEYS[1])`,
        1,
        key,
      );

    if (typeof raw !== 'string') {
      throw new UnauthorizedException(
        'Bank-change authorization expired or was already used',
      );
    }

    let grant: Grant;

    try {
      grant = JSON.parse(raw) as Grant;
    } catch {
      throw new UnauthorizedException(
        'Invalid bank-change authorization',
      );
    }

    if (
      grant.userId !== userId ||
      grant.claimId !== claimId ||
      grant.fingerprint !== fingerprint
    ) {
      throw new UnauthorizedException(
        'Bank-change authorization does not match this request',
      );
    }

    // Authorization has been consumed successfully.
    // The coordinator performs final database,
    // payout-state and account-ownership checks.
    //
    // Never return the underlying OTP or grant.
  }
}
