import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  Prisma,
  ClaimType,
  PrizePayoutStatus,
  PrizeClaimStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

// Draw states in which a purchase may still be refunded. Once COMPLETED,
// outcomes are known and refunds become dispute-resolution, not finance ops.
@Injectable()
export class FinanceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // Reconciliation: confirmed money by gateway for a given UTC day range.
  async reconciliation(fromDate: string, toDate: string) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setUTCHours(23, 59, 59, 999);

    const byGateway = await this.prisma.paymentTransaction.groupBy({
      by: ['gateway', 'status'],
      where: { createdAt: { gte: from, lte: to } },
      _sum: { amountNgn: true, ticketCount: true },
      _count: true,
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      rows: byGateway.map((g) => ({
        gateway: g.gateway,
        status: g.status,
        amountNgn: g._sum.amountNgn ?? 0,
        tickets: g._sum.ticketCount ?? 0,
        transactions: g._count,
      })),
    };
  }

  async retryCommission(
    disbId: string,
    _adminId: string,
  ) {
    const disb =
      await this.prisma.commissionDisbursement.findUnique({
        where: {
          disbId,
        },
      });

    if (!disb) {
      throw new NotFoundException(
        'Disbursement not found',
      );
    }

    throw new ConflictException(
      'CommissionDisbursement is a retired legacy model. Review this historical row during Phase 8 migration instead of retrying it.',
    );
  }

  // Prize payouts: cash claims paid via app transfer or agent cash.
// Read-only record view. The payout provider is stored per claim so
// Finance can distinguish DEV, MONNIFY, FLUTTERWAVE, etc.
  async listPayouts(f: {
  status?: PrizeClaimStatus;
  fromDate?: string;
  toDate?: string;
}) {
  const hasDateRange =
    Boolean(
      f.fromDate ||
      f.toDate,
    );

  const dateRange = {
    ...(f.fromDate
      ? {
          gte:
            new Date(
              `${f.fromDate}T00:00:00.000Z`,
            ),
        }
      : {}),

    ...(f.toDate
      ? {
          lte:
            new Date(
              `${f.toDate}T23:59:59.999Z`,
            ),
        }
      : {}),
  };

  const and:
    Prisma.PrizeClaimWhereInput[] = [
      {
        OR: [
          {
            payoutAttempts: {
              some: {},
            },
          },

          {
            payoutStatus: {
              not: null,
            },
          },

          {
            payoutReference: {
              not: null,
            },
          },

          {
            paidByAgentId: {
              not: null,
            },
          },

          /*
           * Cleared bank payouts that Finance still
           * needs to initiate.
           */
          {
          
            status: PrizeClaimStatus.KYC_CLEARED,
          },
          
        ],
      },
    ];

  if (hasDateRange) {
    and.push({
      OR: [
        {
          payoutInitiatedAt:
            dateRange,
        },
        {
          payoutInitiatedAt:
            null,

          createdAt:
            dateRange,
        },
      ],
    });
  }

  const where:
    Prisma.PrizeClaimWhereInput = {
      claimType:
        ClaimType.CASH,

      ...(f.status
        ? {
            status:
              f.status,
          }
        : {}),

      AND:
        and,
    };

  const rows =
    await this.prisma.prizeClaim.findMany({
      where,

      orderBy: {
        createdAt:
          'desc',
      },

      take:
        200,

      select: {
        claimId:
          true,

        winnerTicketRef:
          true,

        winnerPhone:
          true,

        status:
          true,

        claimType:
          true,

        grossPrizeValueNgn:
          true,

        whtAmountNgn:
          true,

        netPrizeValueNgn:
          true,

        payoutStatus:
          true,

        payoutProvider:
          true,

        payoutReference:
          true,

        payoutInitiatedAt:
          true,

        payoutLastCheckedAt:
          true,

        payoutFailureReason:
          true,

        paidByAgentId:
          true,

        fulfilledAt:
          true,

        createdAt:
          true,
        
        winnerUserId: true,
        kycBankCode: true,
        kycBankAccountLast4: true,
        kycBankAccountName: true,

        identityChecks: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: {
            provider: true,
            status: true,
            verifiedAt: true,
            paystackCustomerCode: true,
            bankCode: true,
            bankAccountLast4: true,
            bankAccountFingerprint: true,
          },
        },

        payoutAttempts: {
          orderBy: {
            attemptNumber:
              'desc',
          },

          take:
            1,

          select: {
            attemptId:
              true,

            claimId:
              true,

            attemptNumber:
              true,

            provider:
              true,

            amountNgn:
              true,

            currency:
              true,

            status:
              true,

            providerReference:
              true,

            providerTransactionId:
              true,

            rawStatus:
              true,

            failureReason:
              true,

            destinationBankCode:
              true,

            destinationAccountLast4:
              true,

            initiatedAt:
              true,

            lastCheckedAt:
              true,

            completedAt:
              true,

            payoutLedgerTxnId:
              true,

            reversalLedgerTxnId:
              true,

            createdAt:
              true,
            verifiedPayoutAccountId: true,
            destinationAccountFingerprint: true
          },
        },

        _count: {
          select: {
            payoutAttempts:
              true,
          },
        },
      },
    });

    
    const lockedAccounts = await this.prisma.verifiedPayoutAccount.findMany({
      where: {
        status: 'LOCKED',
        user: {
          phoneNumber: {
            in: rows.map((row) => row.winnerPhone),
          },
        },
      },
      select: {
        payoutAccountId: true,
        userId: true,
        bankCode: true,
        accountLast4: true,
        accountFingerprint: true,
        resolvedAccountName: true,
        verifiedAt: true,
        lockedAt: true,
        revokedAt: true,
        user: {
          select: {
            userId: true,
            phoneNumber: true,
          },
        },
        identityCheck: {
          select: {
            provider: true,
            status: true,
            verifiedAt: true,
            paystackCustomerCode: true,
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

    const lockedByPhone = new Map(
      lockedAccounts.map((account) => [
        account.user.phoneNumber,
        account,
      ]),
    );


  const nonTerminal:
    PrizePayoutStatus[] = [
      PrizePayoutStatus.REQUESTED,
      PrizePayoutStatus.SUBMITTED,
      PrizePayoutStatus.PROCESSING,
      PrizePayoutStatus.UNKNOWN,
    ];

  return {
    payouts:
      rows.map(
        (r) => {
          const latest =
            r.payoutAttempts[0] ??
            null;
          
            
          const beneficiary = lockedByPhone.get(r.winnerPhone);
          const currentIdentity = r.identityChecks[0];
          const source = beneficiary?.identityCheck;

          const normalizedName = (value: string) =>
            value.trim().replace(/\s+/g, ' ').toUpperCase();

          const beneficiaryReady = Boolean(
            beneficiary &&
            beneficiary.verifiedAt &&
            beneficiary.lockedAt &&
            !beneficiary.revokedAt &&
            (!r.winnerUserId || r.winnerUserId === beneficiary.userId) &&
            beneficiary.bankCode === r.kycBankCode &&
            beneficiary.accountLast4 === r.kycBankAccountLast4 &&
            beneficiary.accountFingerprint ===
            currentIdentity?.bankAccountFingerprint &&
              !!r.kycBankAccountName &&
            normalizedName(beneficiary.resolvedAccountName) ===
            normalizedName(r.kycBankAccountName) &&
            currentIdentity?.provider === 'PAYSTACK' &&
            currentIdentity.status === 'VERIFIED' &&
            !!currentIdentity.verifiedAt &&
            !!currentIdentity.paystackCustomerCode &&
            currentIdentity.bankCode === beneficiary.bankCode &&
            currentIdentity.bankAccountLast4 === beneficiary.accountLast4 &&
            source?.provider === 'PAYSTACK' &&
            source.status === 'VERIFIED' &&
            !!source.verifiedAt &&
            !!source.paystackCustomerCode &&
            source.claim.winnerPhone === r.winnerPhone &&
            (!source.claim.winnerUserId ||
            source.claim.winnerUserId === beneficiary.userId)
          );


          const payoutStatus =
            latest?.status ??
            r.payoutStatus;

          const payoutProvider =
            latest?.provider ??
            r.payoutProvider;

          const payoutReference =
            latest?.providerReference ??
            r.payoutReference;

          const channel =
            r.paidByAgentId ||
            r.payoutReference?.startsWith(
              'AGT-CASH-',
            )
              ? 'AGENT_CASH'
              : 'BANK_TRANSFER';

          
          const canInitiate =
            channel === 'BANK_TRANSFER' &&
            !latest &&
            !r.payoutStatus &&
            !r.payoutReference &&
            !r.paidByAgentId &&
            r.status === PrizeClaimStatus.KYC_CLEARED &&
            beneficiaryReady;

          const retryAllowed = Boolean(
            channel === 'BANK_TRANSFER' &&
            latest &&
            (
              latest.status === PrizePayoutStatus.FAILED ||
              latest.status === PrizePayoutStatus.REVERSED
            ) &&
            r.status === PrizeClaimStatus.KYC_CLEARED &&
            beneficiaryReady &&
            latest.verifiedPayoutAccountId ===
            beneficiary?.payoutAccountId &&
            latest.destinationAccountFingerprint ===
            beneficiary?.accountFingerprint
          );


          const refreshAllowed =
            Boolean(
              latest &&
              nonTerminal.includes(
                latest.status,
              ),
            );

          const needsReview =
            latest?.status ===
              PrizePayoutStatus.UNKNOWN ||
            latest?.status ===
              PrizePayoutStatus.REVERSED;

          return {
            claimId:
              r.claimId,

            winnerTicketRef:
              r.winnerTicketRef,

            winnerPhone:
              r.winnerPhone,

            status:
              r.status,

            claimType:
              r.claimType,

            grossPrizeValueNgn:
              r.grossPrizeValueNgn,

            whtAmountNgn:
              r.whtAmountNgn,

            netPrizeValueNgn:
              r.netPrizeValueNgn,

            payoutStatus,

            payoutProvider,

            payoutReference,

            payoutFailureReason:
              latest?.failureReason ??
              r.payoutFailureReason,

            channel,

            payoutInitiatedAt:
              (
                latest?.initiatedAt ??
                r.payoutInitiatedAt
              )?.toISOString() ??
              null,

            payoutLastCheckedAt:
              (
                latest?.lastCheckedAt ??
                r.payoutLastCheckedAt
              )?.toISOString() ??
              null,

            accountLast4:
              latest?.destinationAccountLast4 ??
              (beneficiaryReady ? beneficiary?.accountLast4 : null) ??
              null,

            fulfilledAt:
              r.fulfilledAt
                ?.toISOString() ??
              null,

            attemptCount:
              r._count.payoutAttempts,

            canInitiate,
            retryAllowed,
            refreshAllowed,
            needsReview,

            currentAttempt:
              latest
                ? {
                    attemptId:
                      latest.attemptId,

                    claimId:
                      latest.claimId,

                    attemptNumber:
                      latest.attemptNumber,

                    provider:
                      latest.provider,

                    amountNgn:
                      latest.amountNgn,

                    currency:
                      latest.currency,

                    status:
                      latest.status,

                    providerReference:
                      latest.providerReference,

                    providerTransactionId:
                      latest.providerTransactionId,

                    rawStatus:
                      latest.rawStatus,

                    failureReason:
                      latest.failureReason,

                    destination: {
                      bankCode:
                        latest.destinationBankCode,

                      accountLast4:
                        latest.destinationAccountLast4,
                    },

                    initiatedAt:
                      latest.initiatedAt.toISOString(),

                    lastCheckedAt:
                      latest.lastCheckedAt
                        ?.toISOString() ??
                      null,

                    completedAt:
                      latest.completedAt
                        ?.toISOString() ??
                      null,

                    payoutLedgerTxnId:
                      latest.payoutLedgerTxnId,

                    reversalLedgerTxnId:
                      latest.reversalLedgerTxnId,

                    createdAt:
                      latest.createdAt.toISOString(),
                  }
                : null,
          };
        },
      ),

    totals: {
      count:
        rows.length,

      grossNgn:
        rows.reduce(
          (sum, r) =>
            sum +
            r.grossPrizeValueNgn,
          0,
        ),

      netPaidNgn:
        rows
          .filter(
            (r) =>
              r.status ===
              PrizeClaimStatus.CASH_PAID,
          )
          .reduce(
            (sum, r) =>
              sum +
              r.netPrizeValueNgn,
            0,
          ),
    },
  };
}
}