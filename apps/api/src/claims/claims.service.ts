import {
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
}