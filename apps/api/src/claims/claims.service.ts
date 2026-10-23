import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaim,
  PrizeClaimStatus,
  PrizePayoutStatus,
  Prisma,
  KycIdentityCheck,
  KycIdentityCheckStatus,
  VerifiedPayoutAccountStatus
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BankResolveService } from './kyc/bank-resolve.service';
import { StorageService } from '../storage/storage.service';
import { WhtDeductionService } from './wht-deduction.service';
import { SettingsService } from '../config/settings.service';
import { RedemptionService } from './redemption.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { KycIdentityEvidenceService } from './kyc/kyc-identity-evidence.service';
import { PayoutAccountCipherService } from '../payout-accounts/payout-account-cipher.service'
import { LockedPayoutDestinationService } from '../payout-accounts/locked-payout-destination.service'

export type ClaimViewDto = {
  claimId: string;
  winnerTicketRef: string;
  drawCode: string;
  prizeDescription: string;
  status: PrizeClaimStatus;
  claimType: ClaimType | null;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  selectionDeadlineAt: string;
  claimDeadlineAt: string;
  createdAt: string;
  // KYC surface for the customer portal (C2b): flags only, never raw data.
  kycBvnVerified: boolean;
  kycHasDocs: boolean;
  kycBank: {
    bankCode: string | null;
    accountLast4: string | null;
    accountName: string;
  } | null;
  payoutStatus: PrizePayoutStatus | null;
  kycIdentityStatus:
    | 'NOT_STARTED'
    | 'PREPARING'
    | 'SUBMITTED'
    | 'VERIFIED'
    | 'FAILED'
    | 'UNKNOWN';
};

type ClaimWithViewData = PrizeClaim & {
  drawResult: {
    draw: {
      drawCode: string;
      prizeDescription: string;
    };
  };
  identityChecks: KycIdentityCheck[];
};

// Statuses in which the winner may still (re)choose product vs cash.
const CHOOSABLE: PrizeClaimStatus[] = [
  PrizeClaimStatus.NOTIFIED,
  PrizeClaimStatus.SELECTION_MADE, // the flip window: change of mind allowed
];

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bankResolve: BankResolveService,
    private readonly storage: StorageService,
    private readonly whtDeductions: WhtDeductionService,
    private readonly settings: SettingsService,
    private readonly redemption: RedemptionService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly identityEvidence: KycIdentityEvidenceService,
    private readonly payoutAccountCipher: PayoutAccountCipherService,
    private readonly lockedDestination: LockedPayoutDestinationService
  ) {}

  async listMine(phoneNumber: string): Promise<{ claims: ClaimViewDto[] }> {
    const claims = await this.prisma.prizeClaim.findMany({
      where: { winnerPhone: phoneNumber },
      include: this.viewInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return { claims: claims.map((c) => this.toView(c)) };
  }

  async getMine(claimId: string, phoneNumber: string): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);
    return this.toView(claim);
  }

  async choose(
    claimId: string,
    phoneNumber: string,
    path: ClaimType,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    if (!CHOOSABLE.includes(claim.status)) {
      throw new ConflictException(
        `Prize option can no longer be changed (status: ${claim.status})`,
      );
    }
    if (claim.selectionDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The selection window for this claim has closed');
    }

    const wht = await this.computeWht(claim.grossPrizeValueNgn, path);

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        claimType: path,
        claimTypeSelectedAt: new Date(),
        status: PrizeClaimStatus.SELECTION_MADE,
        ...wht,
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_TYPE_SELECTED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: {
        path,
        previous: claim.claimType,
        winnerTicketRef: claim.winnerTicketRef,
      },
    });

    return this.toView(updated);
  }

  async listForReview(status?: PrizeClaimStatus) {
    const claims = await this.prisma.prizeClaim.findMany({
      where: status ? { status } : undefined,
      include: this.viewInclude(),
      orderBy: { createdAt: 'asc' },
    });

    return {
      claims: claims.map((claim) => {
        const view = this.toView(claim);
        const latest = claim.identityChecks[0];
        const identityVerified = view.kycBvnVerified;

        return {
          ...view,
          winnerPhone: claim.winnerPhone,
          // Compatibility for the current admin UI, but do not expose
          // legacy unverified kycBvnVerifiedAt timestamps.
          kycBvnVerifiedAt: identityVerified
            ? latest?.verifiedAt?.toISOString() ?? null
            : null,
          identityVerified,
          identityStatus: view.kycIdentityStatus,
          hasIdDoc: !!claim.kycIdDocPath,
          hasSelfie: !!claim.kycSelfiePath,
          bankResolved: !!claim.kycBankAccountName,
        };
      }),
    };
  }

  
async reviewKyc(
  claimId: string,
  adminId: string,
  decision: 'APPROVE' | 'REJECT',
  note?: string,
) {
  // Preserve the existing rejection behavior.
  if (decision === 'REJECT') {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
      throw new ConflictException(
        'Claim is not awaiting KYC review',
      );
    }

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
      action: 'CLAIM_KYC_REJECTED',
      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },
      metadata: {
        note: note ?? null,
      },
    });

    return this.toView(claim);
  }

  // Approval and beneficiary locking must succeed
  // together or neither change should be committed.
  const updated = await this.prisma.$transaction(
    async (tx) => {
      // Serialize approval with other operations on
      // the same prize claim.
      await tx.$queryRaw`
        SELECT "claim_id"
        FROM "prize_claims"
        WHERE "claim_id" = ${claimId}
        FOR UPDATE
      `;

      const claim = await tx.prizeClaim.findUnique({
        where: { claimId },
        include: this.viewInclude(),
      });

      if (!claim) {
        throw new NotFoundException('Claim not found');
      }

      if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
        throw new ConflictException(
          'Claim is not awaiting KYC review',
        );
      }

      if (!claim.claimType) {
        throw new ConflictException(
          'Prize option must be selected before KYC approval',
        );
      }

      if (!claim.kycIdDocPath || !claim.kycSelfiePath) {
        throw new ConflictException(
          'ID document and selfie are required',
        );
      }

      // The latest Paystack identity attempt must
      // have completed successfully.
      //
      // Never trust the old kycBvnVerifiedAt field.
      const identityCheck =
        await this.identityEvidence.requireVerified(
          tx,
          claim,
        );

      if (
        !/^[a-f0-9]{64}$/i.test(
          identityCheck.bankAccountFingerprint,
        )
      ) {
        throw new ConflictException(
          'Complete Paystack bank ownership evidence is required',
        );
      }

      // Only cash claims require a locked bank beneficiary.
      // Preserve the existing product-claim approval path.
      if (claim.claimType === ClaimType.CASH) {
        // Identify the customer through the verified
        // phone number already associated with the claim.
        const user = await tx.user.findUnique({
          where: {
            phoneNumber: claim.winnerPhone,
          },
          select: {
            userId: true,
          },
        });

        if (
          !user ||
          (
            claim.winnerUserId &&
            claim.winnerUserId !== user.userId
          )
        ) {
          throw new ConflictException(
            'Claim and customer ownership mismatch',
          );
        }

        if (
          claim.claimType === ClaimType.CASH &&
            identityCheck.bankChangeAuthorizedAt
        ) {
            const coolingOffMs = 24 * 60 * 60 * 1000;

              if (
                  Date.now() -
                  identityCheck.bankChangeAuthorizedAt.getTime() <
                  coolingOffMs
                ) {
                  throw new ConflictException(
                    'Bank account changes require a 24-hour security cooling-off period before compliance approval',
                  );
                }
              }

        // Use the same claim -> customer lock order
        // as the identity coordinator and webhook.
        await tx.$queryRaw`
          SELECT "user_id"
          FROM "users"
          WHERE "user_id" = ${user.userId}
          FOR UPDATE
        `;



        // Only a previously verified or already locked
        // account can qualify for compliance approval.
        //
        // PENDING and REVOKED are never eligible.
        const account =
          await tx.verifiedPayoutAccount.findFirst({
            where: {
              userId: user.userId,
              status: {
                in: [
                  VerifiedPayoutAccountStatus.VERIFIED,
                  VerifiedPayoutAccountStatus.LOCKED,
                ],
              },
            },
            include: {
              identityCheck: {
                include: {
                  claim: {
                    select: {
                      winnerPhone: true,
                      winnerUserId: true,
                    },
                  },
                },
              },
            },
          });

        if (!account) {
          throw new ConflictException(
            'A verified payout account is required before cash claim approval',
          );
        }

        // Ensure the beneficiary has authentic,
        // successful Paystack verification evidence.
        const sourceCheck = account.identityCheck;

        if (
          !sourceCheck ||
          sourceCheck.provider !== 'PAYSTACK' ||
          sourceCheck.status !==
            KycIdentityCheckStatus.VERIFIED ||
          !sourceCheck.verifiedAt ||
          !sourceCheck.paystackCustomerCode ||
          !account.verifiedAt ||
          account.revokedAt
        ) {
          throw new ConflictException(
            'Payout account ownership has not been verified',
          );
        }

        // Check the original verification also belonged
        // to this SureWina customer.
        if (
          sourceCheck.claim.winnerPhone !== claim.winnerPhone ||
          (
            sourceCheck.claim.winnerUserId &&
            sourceCheck.claim.winnerUserId !== user.userId
          )
        ) {
          throw new ConflictException(
            'Payout account verification ownership mismatch',
          );
        }

        // Enforce the expected account lifecycle.
        if (
          account.status ===
            VerifiedPayoutAccountStatus.VERIFIED &&
          account.lockedAt !== null
        ) {
          throw new ConflictException(
            'Invalid verified payout account state',
          );
        }

        if (
          account.status ===
            VerifiedPayoutAccountStatus.LOCKED &&
          !account.lockedAt
        ) {
          throw new ConflictException(
            'Invalid locked payout account state',
          );
        }

        if (
          account.currency !== 'NGN' ||
          account.bankCode !== identityCheck.bankCode ||
          account.accountLast4 !==
            identityCheck.bankAccountLast4 ||
          account.accountFingerprint !==
            identityCheck.bankAccountFingerprint ||
          sourceCheck.bankCode !== account.bankCode ||
          sourceCheck.bankAccountLast4 !==
            account.accountLast4 ||
          sourceCheck.bankAccountFingerprint !==
            account.accountFingerprint
        ) {
          throw new ConflictException(
            'Payout account does not match verified identity evidence',
          );
        }

        // The verified account name must also match
        // the bank details nominated for this claim.
        const normalizeName = (value: string) =>
          value.trim().replace(/\s+/g, ' ').toUpperCase();

        if (
          !claim.kycBankAccountName ||
          !account.resolvedAccountName ||
          normalizeName(account.resolvedAccountName) !==
            normalizeName(claim.kycBankAccountName)
        ) {
          throw new ConflictException(
            'Payout account holder name does not match KYC',
          );
        }

        // Decrypt only inside this trusted server operation.
        // Do not log or return the decrypted account number.
        const accountNumber =
          this.payoutAccountCipher.decrypt(
            user.userId,
            account.bankCode,
            account.accountCiphertext,
          );

        if (
          account.accountLast4 !==
          accountNumber.slice(-4)
        ) {
          throw new ConflictException(
            'Stored payout account metadata mismatch',
          );
        }

        // Validate the FULL ten-digit NUBAN against
        // the latest Paystack verification for this claim.
        this.identityEvidence.assertDestinationMatches(
          identityCheck,
          account.bankCode,
          accountNumber,
        );

        // Also verify the original Paystack identity
        // evidence associated with the beneficiary.
        this.identityEvidence.assertDestinationMatches(
          sourceCheck,
          account.bankCode,
          accountNumber,
        );

        // Transition VERIFIED -> LOCKED.
        //
        // An already LOCKED account can be reused for
        // another properly verified claim with the same
        // bank details.
        if (
          account.status ===
          VerifiedPayoutAccountStatus.VERIFIED
        ) {
          const locked =
            await tx.verifiedPayoutAccount.updateMany({
              where: {
                payoutAccountId:
                  account.payoutAccountId,
                userId: user.userId,
                status:
                  VerifiedPayoutAccountStatus.VERIFIED,
                revokedAt: null,
              },
              data: {
                status:
                  VerifiedPayoutAccountStatus.LOCKED,
                lockedAt: new Date(),
              },
            });

          if (locked.count !== 1) {
            throw new ConflictException(
              'Payout account could not be locked',
            );
          }
        }
      }

      // Preserve the existing financial calculations.
      const wht = await this.computeWht(
        claim.grossPrizeValueNgn,
        claim.claimType,
      );

      // Commit claim approval in the same transaction
      // as the payout-account lock.
      return tx.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.KYC_CLEARED,
          kycReviewedBy: adminId,
          kycReviewedAt: new Date(),
          ...wht,
        },
        include: this.viewInclude(),
      });
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await this.audit.write({
    severity: AuditSeverity.INFO,
    actor: {
      type: AuditActorType.ADMIN,
      id: adminId,
    },
    action: 'CLAIM_KYC_APPROVED',
    resource: {
      type: 'PrizeClaim',
      id: claimId,
    },
    metadata: {
      identityProvider: 'PAYSTACK',
      netPrizeValueNgn: updated.netPrizeValueNgn,
      whtAmountNgn: updated.whtAmountNgn,
    },
  });

  // Preserve redemption-code generation.
  void this.issueRedemptionCode(updated).catch((error) => {
    this.logger.error(
      `Redemption code issue failed for claim ${claimId}: ${
        error instanceof Error
          ? error.message
          : 'unknown'
      }`,
    );
  });

  return this.toView(updated);
}



  async listCollectionPoints(stateCode?: string) {
    const points = await this.prisma.collectionPoint.findMany({
      where: { isActive: true, ...(stateCode ? { stateCode } : {}) },
      orderBy: [{ stateCode: 'asc' }, { name: 'asc' }],
    });
    return { points };
  }

  async bookCollection(
    claimId: string,
    phoneNumber: string,
    collectionPointId: string,
    preferredDate: string,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);
    if (claim.claimType !== ClaimType.PRODUCT) {
      throw new ConflictException('Collection booking is for product claims');
    }
    if (claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException(`Claim is not cleared for collection (status: ${claim.status})`);
    }
    const when = new Date(preferredDate);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      throw new BadRequestException('preferredDate must be a future date');
    }
    const point = await this.prisma.collectionPoint.findFirst({
      where: { pointId: collectionPointId, isActive: true },
    });
    if (!point) throw new NotFoundException('Collection point not found');

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        collectionPointId,
        collectionScheduledAt: when,
        status: PrizeClaimStatus.PRODUCT_BOOKED,
      },
      include: this.viewInclude(),
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_COLLECTION_BOOKED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { collectionPointId, preferredDate: when.toISOString() },
    });
    return this.toView(updated);
  }

  
  async confirmPayoutAccount(
    claimId: string,
    phoneNumber: string,
  ) {
    const destination = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const claim = await tx.prizeClaim.findUnique({
          where: { claimId },
        });

        if (!claim || claim.winnerPhone !== phoneNumber) {
          throw new NotFoundException('Claim not found');
        }

        if (
          claim.claimType !== ClaimType.CASH ||
          claim.status !== PrizeClaimStatus.KYC_CLEARED
        ) {
          throw new ConflictException(
            'Cash claim is not cleared for payout',
          );
        }

        // No account number is accepted from the client.
        // Only the stored LOCKED beneficiary is authoritative.
        return this.lockedDestination.requireLocked(tx, claim);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: {
        type: AuditActorType.CUSTOMER,
        id: phoneNumber,
      },
      action: 'CLAIM_PAYOUT_ACCOUNT_CONFIRMED',
      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },
      metadata: {
        payoutAccountId: destination.payoutAccountId,
        bankCode: destination.bankCode,
        accountLast4: destination.accountLast4,
      },
    });

    const view = await this.getMine(claimId, phoneNumber);

    return {
      ...view,
      payoutAccountConfirmed: true,
    };
  }


  async markDelivered(claimId: string, adminId: string): Promise<ClaimViewDto> {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== PrizeClaimStatus.PRODUCT_BOOKED) {
      throw new ConflictException(`Claim is not awaiting delivery (status: ${claim.status})`);
    }
    const updated = await this.prisma.prizeClaim.update({
      where: { claimId },
      data: { status: PrizeClaimStatus.DELIVERED, fulfilledAt: new Date() },
      include: this.viewInclude(),
    });
    await this.whtDeductions.recordForClaim(claimId);
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CLAIM_PRODUCT_DELIVERED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: { winnerTicketRef: claim.winnerTicketRef },
    });
    return this.toView(updated);
  }

  // ─── helpers ──────────────────────────────────────────────

  // Mints the collection code and sends it to the winner. Split out so the
  // clear code lives in exactly one scope and is never returned to a caller
  // or logged — after this it exists only as a hash and in the winner's SMS.
  private async issueRedemptionCode(claim: {
    claimId: string;
    winnerPhone: string;
    claimDeadlineAt: Date;
    drawResult: { draw: { prizeDescription: string } };
  }) {
    const code = await this.redemption.issue(claim.claimId);
    await this.notificationQueue.enqueueRedemptionCodeSms({
      claimId: claim.claimId,
      winnerPhone: claim.winnerPhone,
      code,
      prizeDescription: claim.drawResult.draw.prizeDescription,
      claimDeadlineAt: claim.claimDeadlineAt.toISOString(),
    });
  }

  
  private viewInclude() {
    return {
      drawResult: {
        select: {
          draw: {
            select: {
              drawCode: true,
              prizeDescription: true,
            },
          },
        },
      },
      identityChecks: {
        orderBy: {
          attemptNumber: 'desc' as const,
        },
        take: 1,
      },
    } as const;
  }


  // Ownership check folded into the fetch. Not-yours returns 404, not 403:
  // a 403 would confirm the claimId exists to whoever is probing.
  private async findOwned(claimId: string, phoneNumber: string) {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim || claim.winnerPhone !== phoneNumber) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  private toView(c: ClaimWithViewData): ClaimViewDto {
    const latest = c.identityChecks[0];

    // Never use the legacy kycBvnVerifiedAt field for authentication.
    // The latest attempt must have an actual Paystack success outcome.
    const identityVerified =
      latest?.provider === 'PAYSTACK' &&
      latest.status === 'VERIFIED' &&
      !!latest.verifiedAt &&
      !!latest.paystackCustomerCode &&
      /^[a-f0-9]{64}$/i.test(latest.bankAccountFingerprint) &&
      (c.claimType !== ClaimType.CASH || (
        !!c.kycBankAccountName &&
        latest.bankCode === c.kycBankCode &&
        latest.bankAccountLast4 === c.kycBankAccountLast4
      ));

    const identityStatus: ClaimViewDto['kycIdentityStatus'] =
      identityVerified
        ? 'VERIFIED'
        : latest?.status === 'VERIFIED'
          ? 'UNKNOWN' // Provider success is not sufficient if bank binding fails.
          : latest?.status ?? 'NOT_STARTED';

    return {
      claimId: c.claimId,
      winnerTicketRef: c.winnerTicketRef,
      drawCode: c.drawResult.draw.drawCode,
      prizeDescription: c.drawResult.draw.prizeDescription,
      status: c.status,
      claimType: c.claimType,
      grossPrizeValueNgn: c.grossPrizeValueNgn,
      whtAmountNgn: c.whtAmountNgn,
      netPrizeValueNgn: c.netPrizeValueNgn,
      selectionDeadlineAt: c.selectionDeadlineAt.toISOString(),
      claimDeadlineAt: c.claimDeadlineAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      payoutStatus: c.payoutStatus,
      kycIdentityStatus: identityStatus,
      kycBvnVerified: identityVerified,
      kycHasDocs: !!(c.kycIdDocPath && c.kycSelfiePath),
      // Show nominated bank details only when identity and bank binding
      // have completed successfully; merely resolving a name is not KYC.
      kycBank: identityVerified && c.kycBankAccountName
        ? {
            bankCode: c.kycBankCode,
            accountLast4: c.kycBankAccountLast4,
            accountName: c.kycBankAccountName,
          }
        : null,
    };
  }

  async submitBvn(
    claimId: string,
    phoneNumber: string,
    _bvn: string,
  ): Promise<never> {
    await this.findOwned(claimId, phoneNumber);

    throw new ConflictException(
      'Use the combined Paystack identity verification process',
    );
  }

  async submitBank(
    claimId: string,
    phoneNumber: string,
    _accountNumber: string,
    _bankCode: string,
  ): Promise<never> {
    await this.findOwned(claimId, phoneNumber);

    throw new ConflictException(
      'Use the combined Paystack identity verification process',
    );
  } 

  async submitDocuments(
    claimId: string,
    phoneNumber: string,
    files: { kind: 'idDoc' | 'selfie'; buffer: Buffer; ext: string }[],
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    const docsOpen: PrizeClaimStatus[] = [
      PrizeClaimStatus.SELECTION_MADE,
      PrizeClaimStatus.KYC_PENDING,
    ];
    if (!docsOpen.includes(claim.status)) {
      throw new ConflictException(
        claim.status === PrizeClaimStatus.NOTIFIED
          ? 'Choose your prize option before uploading documents'
          : `Documents cannot be submitted on this claim (status: ${claim.status})`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }
    if (files.length === 0) {
      throw new BadRequestException(
        'Attach at least one file field named idDoc or selfie',
      );
    }

    const data: { kycIdDocPath?: string; kycSelfiePath?: string } = {};
    for (const f of files) {
      const key = `kyc/${claim.claimId}/${f.kind}-${Date.now()}.${f.ext}`;
      const stored = await this.storage.save(key, f.buffer);
      if (f.kind === 'idDoc') data.kycIdDocPath = stored;
      else data.kycSelfiePath = stored;
    }

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data,
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_DOCUMENTS_UPLOADED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { kinds: files.map((f) => f.kind) },
    });

    return this.toView(updated);
  }

  // WHT applies to CASH prizes at/above the threshold. Integer naira,
  // rounded down in the winner's favour on the tax side.
  private async computeWht(grossNgn: number, path: ClaimType) {
    const rate = await this.settings.getNumber('WHT_RATE_PERCENT', 5);
    const threshold = await this.settings.getNumber('WHT_THRESHOLD_NGN', 0);

    if (path !== ClaimType.CASH || grossNgn < threshold || rate === 0) {
      return { whtApplicable: false, whtAmountNgn: 0, netPrizeValueNgn: grossNgn };
    }
    const whtAmountNgn = Math.floor((grossNgn * rate) / 100);
    return { whtApplicable: true, whtAmountNgn, netPrizeValueNgn: grossNgn - whtAmountNgn };
  }
}