import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import {
  AuditActorType,
  AuditSeverity,
  IdentityDocumentType,
  IdentityVerificationStatus,
  KycStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BvnMatchStatus,
  MonnifyVerificationService,
} from '../integrations/monnify/monnify-verification.service';

export type VerifyBvnInput = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  bvn: string;
};

export type VerifiedIdentityView = {
  documentType: IdentityDocumentType;
  firstName: string;
  lastName: string;
  verifiedAt: string;
  // True when this call found an existing verification and charged nothing.
  alreadyVerified: boolean;
};

// Nigeria's legal gambling age. Checked before any paid verification, so an
// underage customer is refused without costing anything.
const MINIMUM_AGE_YEARS = 18;

const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{0,48}[A-Za-z]$/;

@Injectable()
export class IdentityVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monnify: MonnifyVerificationService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async getStatus(userId: string) {
    const identity = await this.prisma.verifiedIdentity.findUnique({
      where: { userId },
    });

    if (!identity) {
      return { verified: false as const };
    }

    return {
      verified: true as const,
      documentType: identity.documentType,
      firstName: identity.firstName,
      lastName: identity.lastName,
      verifiedAt: identity.verifiedAt.toISOString(),
    };
  }

  // The identity a customer has proven, for later steps that need it — the
  // CBA client and the Monnify reserved account both use these names and
  // this date of birth. Throws if the customer is not verified.
  async requireVerified(userId: string) {
    const identity = await this.prisma.verifiedIdentity.findUnique({
      where: { userId },
    });

    if (!identity) {
      throw new ConflictException('Identity has not been verified');
    }

    return identity;
  }

  // Confirms a BVN supplied now is the one this customer verified with, and
  // returns their identity. Used where the raw BVN is needed again — it is
  // never stored, so it can only be checked by fingerprint, not looked up.
  async requireVerifiedBvn(userId: string, bvn: string) {
    const identity = await this.requireVerified(userId);

    if (identity.identityFingerprint !== this.fingerprint(bvn.trim())) {
      throw new ConflictException(
        'This BVN does not match the verified identity',
      );
    }

    return identity;
  }

  // Verifies a customer's BVN against their supplied name and date of birth.
  //
  // Safe to call repeatedly with the same BVN: once a customer is verified,
  // a matching BVN returns the existing record without contacting Monnify
  // or paying again. That is what lets later onboarding steps take the BVN
  // afresh on every retry without ever storing it.
  async verifyBvn(
    userId: string,
    input: VerifyBvnInput,
  ): Promise<VerifiedIdentityView> {
    const firstName = this.cleanName(input.firstName, 'First name');
    const lastName = this.cleanName(input.lastName, 'Last name');
    const dateOfBirth = this.requireAdultDate(input.dateOfBirth);
    const bvn = input.bvn.trim();

    if (!/^\d{11}$/.test(bvn)) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        phoneNumber: true,
        selfExclusionUntil: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    // Someone who has excluded themselves from gambling must not be able to
    // open a funded wallet during that period.
    if (
      user.selfExclusionUntil &&
      user.selfExclusionUntil.getTime() > Date.now()
    ) {
      throw new ForbiddenException(
        'Your account is self-excluded. Wallet funding is unavailable until the exclusion ends.',
      );
    }

    const fingerprint = this.fingerprint(bvn);

    const existing = await this.prisma.verifiedIdentity.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.identityFingerprint !== fingerprint) {
        throw new ConflictException(
          'This account is already verified with a different BVN',
        );
      }

      return this.view(existing, true);
    }

    await this.requireAttemptsRemaining(userId);

    // One BVN, one customer. Checked before calling Monnify so a BVN already
    // in use costs nothing to reject. Stops one person running several
    // accounts — the usual way promotions get farmed.
    const takenBy = await this.prisma.verifiedIdentity.findUnique({
      where: { identityFingerprint: fingerprint },
    });

    if (takenBy) {
      await this.recordAttempt(userId, fingerprint, {
        status: IdentityVerificationStatus.FAILED,
        failureReason: 'BVN_IN_USE',
      });

      throw new ConflictException(
        'This BVN cannot be used for this account',
      );
    }

    const attempt = await this.prisma.identityVerificationAttempt.create({
      data: {
        userId,
        documentType: IdentityDocumentType.BVN,
        identityFingerprint: fingerprint,
        status: IdentityVerificationStatus.PENDING,
      },
    });

    let result;

    try {
      result = await this.monnify.matchBvnDetails({
        bvn,
        name: `${firstName} ${lastName}`,
        dateOfBirth,
        mobileNo: this.localMobile(user.phoneNumber),
      });
    } catch {
      // Upstream fault, not the customer's. Does not count against their
      // attempt limit.
      await this.prisma.identityVerificationAttempt.update({
        where: { attemptId: attempt.attemptId },
        data: {
          status: IdentityVerificationStatus.ERROR,
          failureReason: 'PROVIDER_ERROR',
          completedAt: new Date(),
        },
      });

      throw new ServiceUnavailableException(
        'Identity verification is unavailable right now. Please try again shortly.',
      );
    }

    if (result.outcome === 'INVALID_BVN') {
      await this.prisma.identityVerificationAttempt.update({
        where: { attemptId: attempt.attemptId },
        data: {
          status: IdentityVerificationStatus.FAILED,
          failureReason: 'INVALID_BVN',
          completedAt: new Date(),
        },
      });

      throw new BadRequestException(
        'That BVN was not recognised. Check it and try again.',
      );
    }

    const matches = {
      nameMatch: result.name,
      dateOfBirthMatch: result.dateOfBirth,
      phoneMatch: result.mobileNo,
    };

    const reason = this.rejectionReason(
      result.name,
      result.dateOfBirth,
      result.mobileNo,
    );

    if (reason) {
      await this.prisma.identityVerificationAttempt.update({
        where: { attemptId: attempt.attemptId },
        data: {
          ...matches,
          status: IdentityVerificationStatus.FAILED,
          failureReason: reason,
          completedAt: new Date(),
        },
      });

      // Deliberately does not say which detail failed. Telling someone
      // "the date of birth is wrong" lets them guess it one attempt at a
      // time using another person's BVN.
      throw new UnprocessableEntityException(
        'These details do not match your BVN record. Enter your name and date of birth exactly as registered with your bank.',
      );
    }

    let identity;

    try {
      identity = await this.prisma.$transaction(async (tx) => {
        await tx.identityVerificationAttempt.update({
          where: { attemptId: attempt.attemptId },
          data: {
            ...matches,
            status: IdentityVerificationStatus.VERIFIED,
            completedAt: new Date(),
          },
        });

        const created = await tx.verifiedIdentity.create({
          data: {
            userId,
            documentType: IdentityDocumentType.BVN,
            identityFingerprint: fingerprint,
            firstName,
            lastName,
            dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
            attemptId: attempt.attemptId,
          },
        });

        await tx.user.update({
          where: { userId },
          data: { kycStatus: KycStatus.TIER1_COMPLETE },
        });

        return created;
      });
    } catch (error) {
      // Another account verified the same BVN between our check and this
      // write. The unique fingerprint is what catches it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.prisma.identityVerificationAttempt.update({
          where: { attemptId: attempt.attemptId },
          data: {
            ...matches,
            status: IdentityVerificationStatus.FAILED,
            failureReason: 'BVN_IN_USE',
            completedAt: new Date(),
          },
        });

        throw new ConflictException(
          'This BVN cannot be used for this account',
        );
      }

      throw error;
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: userId },
      action: 'IDENTITY_VERIFIED',
      resource: { type: 'User', id: userId },
      metadata: {
        documentType: IdentityDocumentType.BVN,
        attemptId: attempt.attemptId,
        phoneMatch: result.mobileNo,
      },
    });

    return this.view(identity, false);
  }

  // Name and date of birth must match outright. A partial name match is a
  // failure: it is exactly what someone using a relative's BVN produces.
  //
  // The phone check is a setting, off by default. Many BVN records carry a
  // number the customer stopped using years ago, so requiring it would
  // refuse genuine customers. It is recorded either way.
  private rejectionReason(
    name: BvnMatchStatus,
    dateOfBirth: BvnMatchStatus,
    mobileNo: BvnMatchStatus,
  ): string | null {
    if (name !== 'FULL_MATCH') return 'NAME_MISMATCH';
    if (dateOfBirth !== 'FULL_MATCH') return 'DATE_OF_BIRTH_MISMATCH';

    if (
      this.config.get<boolean>('KYC_REQUIRE_BVN_PHONE_MATCH') === true &&
      mobileNo !== 'FULL_MATCH'
    ) {
      return 'PHONE_MISMATCH';
    }

    return null;
  }

  // Each failed check costs ₦10 and, for someone holding another person's
  // BVN, is a guess at their date of birth. A daily cap bounds both.
  // Provider errors do not count — those are not the customer's fault.
  private async requireAttemptsRemaining(userId: string): Promise<void> {
    const limit =
      this.config.get<number>('KYC_MAX_FAILED_ATTEMPTS_PER_DAY') ?? 3;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failed = await this.prisma.identityVerificationAttempt.count({
      where: {
        userId,
        status: IdentityVerificationStatus.FAILED,
        createdAt: { gte: since },
      },
    });

    if (failed >= limit) {
      throw new HttpException(
        'Too many unsuccessful attempts. Please try again in 24 hours.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordAttempt(
    userId: string,
    fingerprint: string,
    outcome: { status: IdentityVerificationStatus; failureReason: string },
  ): Promise<void> {
    await this.prisma.identityVerificationAttempt.create({
      data: {
        userId,
        documentType: IdentityDocumentType.BVN,
        identityFingerprint: fingerprint,
        status: outcome.status,
        failureReason: outcome.failureReason,
        completedAt: new Date(),
      },
    });
  }

  // The BVN is never stored. Only this keyed fingerprint is, so the same BVN
  // can be recognised again without being readable by anyone with database
  // access. The domain prefix keeps these fingerprints distinct from the
  // bank-account ones made with the same key.
  private fingerprint(bvn: string): string {
    const key = this.config.get<string>('KYC_BANK_FINGERPRINT_KEY')?.trim();

    if (!key || key.length < 32) {
      throw new ServiceUnavailableException(
        'Identity fingerprinting is not configured',
      );
    }

    return createHmac('sha256', key)
      .update(`surewina:identity:v1:BVN:${bvn}`)
      .digest('hex');
  }

  private cleanName(value: string, label: string): string {
    const name = (value ?? '').trim().replace(/\s+/g, ' ');

    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        `${label} must be 2-50 letters, as on your bank records`,
      );
    }

    return name;
  }

  private requireAdultDate(isoDate: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
    const date = match ? new Date(`${isoDate}T00:00:00.000Z`) : null;

    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== isoDate
    ) {
      throw new BadRequestException('Date of birth must use YYYY-MM-DD');
    }

    const now = new Date();
    const adultFrom = new Date(
      Date.UTC(
        now.getUTCFullYear() - MINIMUM_AGE_YEARS,
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );

    if (date.getTime() > adultFrom.getTime()) {
      throw new ForbiddenException(
        `You must be at least ${MINIMUM_AGE_YEARS} to use a SureWina wallet`,
      );
    }

    return isoDate;
  }

  // +2348012345678 → 08012345678, the form BVN records use.
  private localMobile(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');

    return digits.startsWith('234') && digits.length === 13
      ? `0${digits.slice(3)}`
      : digits;
  }

  private view(
    identity: {
      documentType: IdentityDocumentType;
      firstName: string;
      lastName: string;
      verifiedAt: Date;
    },
    alreadyVerified: boolean,
  ): VerifiedIdentityView {
    return {
      documentType: identity.documentType,
      firstName: identity.firstName,
      lastName: identity.lastName,
      verifiedAt: identity.verifiedAt.toISOString(),
      alreadyVerified,
    };
  }
}