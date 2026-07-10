import {
    BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaim,
  PrizeClaimStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createHash } from 'crypto';
import { BvnVerificationService } from './kyc/bvn-verification.service';
import { BankResolveService } from './kyc/bank-resolve.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { PaystackTransferService } from './payout/paystack-transfer.service';
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
};

// Statuses in which the winner may still (re)choose product vs cash.
const CHOOSABLE: PrizeClaimStatus[] = [
  PrizeClaimStatus.NOTIFIED,
  PrizeClaimStatus.SELECTION_MADE, // the flip window: change of mind allowed
];

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bvnVerification: BvnVerificationService,
    private readonly bankResolve: BankResolveService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly transfers: PaystackTransferService,
  ) {}

  async listMine(phoneNumber: string): Promise<{ claims: ClaimViewDto[] }> {
    const claims = await this.prisma.prizeClaim.findMany({
      where: { winnerPhone: phoneNumber },
      include: {
        drawResult: {
          select: { draw: { select: { drawCode: true, prizeDescription: true } } },
        },
      },
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

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        claimType: path,
        claimTypeSelectedAt: new Date(),
        status: PrizeClaimStatus.SELECTION_MADE,
        ...this.computeWht(claim.grossPrizeValueNgn, path),
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
      claims: claims.map((c) => ({
        ...this.toView(c),
        winnerPhone: c.winnerPhone,
        kycBvnVerifiedAt: c.kycBvnVerifiedAt?.toISOString() ?? null,
        hasIdDoc: !!c.kycIdDocPath,
        hasSelfie: !!c.kycSelfiePath,
        bankResolved: !!c.kycBankAccountName,
      })),
    };
  }

  async reviewKyc(
    claimId: string,
    adminId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
      throw new ConflictException(`Claim is not awaiting review (status: ${claim.status})`);
    }

    if (decision === 'APPROVE') {
      // The evidence gate: nothing clears without the full set.
      const missing: string[] = [];
      if (!claim.kycBvnVerifiedAt) missing.push('verified BVN');
      if (!claim.kycIdDocPath) missing.push('ID document');
      if (!claim.kycSelfiePath) missing.push('selfie');
      if (claim.claimType === ClaimType.CASH && !claim.kycBankAccountName) {
        missing.push('resolved bank account');
      }
      if (missing.length > 0) {
        throw new ConflictException(`Cannot approve — missing: ${missing.join(', ')}`);
      }

      const updated = await this.prisma.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.KYC_CLEARED,
          kycReviewedBy: adminId,
          kycReviewedAt: new Date(),
          // Finalize WHT at certification time (backfills pre-WHT claims).
          ...this.computeWht(claim.grossPrizeValueNgn, claim.claimType!),
        },
        include: this.viewInclude(),
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.ADMIN, id: adminId },
        action: 'CLAIM_KYC_APPROVED',
        resource: { type: 'PrizeClaim', id: claimId },
        metadata: { whtAmountNgn: updated.whtAmountNgn, netPrizeValueNgn: updated.netPrizeValueNgn },
      });
      return this.toView(updated);
    }

    // REJECT: stays KYC_PENDING so the winner can fix and resubmit.
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CLAIM_KYC_REJECTED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: { note: note ?? null },
    });
    return this.toView(claim);
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
    accountNumber: string,
    bankCode: string,
  ) {
    const claim = await this.findOwned(claimId, phoneNumber);
    if (claim.claimType !== ClaimType.CASH) {
      throw new ConflictException('Payout account applies to cash claims only');
    }
    if (claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException(`Claim is not cleared for payout (status: ${claim.status})`);
    }
    // Must match what compliance approved: same bank, same last4, and the
    // freshly-resolved name must equal the stored one.
    if (bankCode !== claim.kycBankCode || accountNumber.slice(-4) !== claim.kycBankAccountLast4) {
      throw new ConflictException('Account does not match the KYC-verified details');
    }
    const resolved = await this.bankResolve.resolve(accountNumber, bankCode);
    if (resolved.accountName !== claim.kycBankAccountName) {
      throw new ConflictException('Account name mismatch with KYC-verified details');
    }

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: { payoutAccountNumber: accountNumber },
      include: this.viewInclude(),
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_PAYOUT_ACCOUNT_CONFIRMED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { accountLast4: accountNumber.slice(-4) },
    });
    return { ...this.toView(updated), payoutAccountConfirmed: true };
  }

  async initiatePayout(claimId: string, adminId: string): Promise<ClaimViewDto> {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.claimType !== ClaimType.CASH || claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException('Claim is not a cleared cash claim');
    }
    if (!claim.payoutAccountNumber || !claim.kycBankCode || !claim.kycBankAccountName) {
      throw new ConflictException('Winner has not confirmed a payout account');
    }
    if (claim.payoutReference) {
      throw new ConflictException('Payout already initiated'); // idempotency
    }

    const result = await this.transfers.payout({
      accountNumber: claim.payoutAccountNumber,
      bankCode: claim.kycBankCode,
      accountName: claim.kycBankAccountName,
      amountNgn: claim.netPrizeValueNgn,
      reason: `Surewina prize ${claim.winnerTicketRef}`,
    });

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId },
      data: {
        payoutReference: result.reference,
        payoutInitiatedAt: new Date(),
        status: PrizeClaimStatus.CASH_PAID,
        fulfilledAt: new Date(),
      },
      include: this.viewInclude(),
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CLAIM_PAYOUT_INITIATED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: {
        reference: result.reference,
        devMode: result.devMode,
        netPrizeValueNgn: claim.netPrizeValueNgn,
      },
    });
    return this.toView(updated);
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

  private viewInclude() {
    return {
      drawResult: {
        select: { draw: { select: { drawCode: true, prizeDescription: true } } },
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

  private toView(
    c: PrizeClaim & {
      drawResult: { draw: { drawCode: string; prizeDescription: string } };
    },
  ): ClaimViewDto {
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
    };
  }

  async submitBvn(
    claimId: string,
    phoneNumber: string,
    bvn: string,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    const kycOpen: PrizeClaimStatus[] = [
      PrizeClaimStatus.SELECTION_MADE,
      PrizeClaimStatus.KYC_PENDING,
    ];
    if (!kycOpen.includes(claim.status)) {
      throw new ConflictException(
        claim.status === PrizeClaimStatus.NOTIFIED
          ? 'Choose your prize option before starting KYC'
          : `KYC is not open on this claim (status: ${claim.status})`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }

    const check = await this.bvnVerification.verify(bvn, phoneNumber);
    if (!check.verified) {
      throw new ConflictException('BVN verification failed');
    }

    const bvnHash = createHash('sha256').update(bvn).digest('hex');

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        kycBvnHash: bvnHash,
        kycBvnVerifiedAt: new Date(),
        status: PrizeClaimStatus.KYC_PENDING, // locks the flip window
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_BVN_SUBMITTED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { devMode: check.devMode, bvnLast4: bvn.slice(-4) },
    });

    return this.toView(updated);
  }

  async submitBank(
    claimId: string,
    phoneNumber: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<ClaimViewDto & { resolvedAccountName: string }> {
    const claim = await this.findOwned(claimId, phoneNumber);

    if (claim.claimType !== ClaimType.CASH) {
      throw new ConflictException(
        'Bank details are only required for cash claims',
      );
    }
    if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
      throw new ConflictException('Submit and verify your BVN first');
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }

    const resolved = await this.bankResolve.resolve(accountNumber, bankCode);

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        kycBankCode: bankCode,
        kycBankAccountLast4: accountNumber.slice(-4),
        kycBankAccountName: resolved.accountName,
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_BANK_RESOLVED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: {
        bankCode,
        accountLast4: accountNumber.slice(-4),
        accountName: resolved.accountName,
      },
    });

    return { ...this.toView(updated), resolvedAccountName: resolved.accountName };
  }

  async submitDocuments(
    claimId: string,
    phoneNumber: string,
    files: { kind: 'idDoc' | 'selfie'; buffer: Buffer; ext: string }[],
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
      throw new ConflictException('Submit and verify your BVN first');
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
  private computeWht(grossNgn: number, path: ClaimType) {
    const rate = Number(this.config.get('WHT_RATE_PERCENT') ?? 5);
    const threshold = Number(this.config.get('WHT_THRESHOLD_NGN') ?? 0);

    if (path !== ClaimType.CASH || grossNgn < threshold || rate === 0) {
      return { whtApplicable: false, whtAmountNgn: 0, netPrizeValueNgn: grossNgn };
    }
    const whtAmountNgn = Math.floor((grossNgn * rate) / 100);
    return { whtApplicable: true, whtAmountNgn, netPrizeValueNgn: grossNgn - whtAmountNgn };
  }
}