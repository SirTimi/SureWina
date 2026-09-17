import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  AuditSeverity,
  LedgerTransactionKind,
  PaymentGateway,
  Prisma,
  WalletFundingStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import {
  SYSTEM_LEDGER_ACCOUNT_CODES,
} from '../ledger/ledger.constants';

import { PaystackDriver } from './gateway/paystack.driver';
import { FlutterwaveDriver } from './gateway/flutterwave.driver';
import { PaymentGatewayDriver } from './gateway/payment-gateway.interface';
import {
  PaymentVerificationService,
  VerifiedProviderPayment,
} from './payment-verification.service';
import { InitiateWalletFundingDto } from './dto/initiate-wallet-funding.dto';

type FundingConfirmationInput = {
  reference: string;
  verifiedPayment: VerifiedProviderPayment;
  rawEvent?: unknown;
};

@Injectable()
export class WalletFundingService {
  private readonly logger = new Logger(WalletFundingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly wallets: WalletService,
    private readonly paystack: PaystackDriver,
    private readonly flutterwave: FlutterwaveDriver,
    private readonly verification: PaymentVerificationService,
  ) {}

  async initiate(userId: string, dto: InitiateWalletFundingDto) {
    this.validateFundingAmount(dto.amountNgn);

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        phoneNumber: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    const wallet = await this.wallets.getCustomerWallet(userId);

    if (wallet.status !== 'ACTIVE') {
      throw new ConflictException(`Wallet is ${wallet.status}`);
    }

    const reference = `SW-WAL-${randomUUID()}`;

    const funding = await this.prisma.walletFunding.create({
      data: {
        walletId: wallet.walletId,
        gatewayReference: reference,
        gateway: PaymentGateway.PAYSTACK,
        amountNgn: dto.amountNgn,
        currency: 'NGN',
        status: WalletFundingStatus.PENDING,
      },
    });

    const email =
      dto.email?.trim().toLowerCase() ??
      user.email?.trim().toLowerCase() ??
      this.syntheticEmail(user.phoneNumber);

    try {
      const initialized = await this.initializeWithFallback(
        funding.fundingId,
        {
          amountKobo: dto.amountNgn * 100,
          reference,
          email,
          callbackUrl:
            `${this.config.getOrThrow<string>('PAYMENT_CALLBACK_BASE_URL')}/wallet/funding/callback`,
          metadata: {
            purpose: 'WALLET_FUNDING',
            fundingId: funding.fundingId,
            walletId: wallet.walletId,
            userId,
          },
        },
      );

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.CUSTOMER, id: userId },
        action: 'WALLET_FUNDING_INITIATED',
        resource: { type: 'WalletFunding', id: funding.fundingId },
        metadata: {
          reference,
          gateway: initialized.gateway,
          amountNgn: dto.amountNgn,
          walletId: wallet.walletId,
        },
      });

      return {
        fundingId: funding.fundingId,
        walletId: wallet.walletId,
        reference,
        gateway: initialized.gateway,
        amountNgn: dto.amountNgn,
        authorizationUrl: initialized.authorizationUrl,
        status: WalletFundingStatus.PENDING,
      };
    } catch (error) {
      await this.prisma.walletFunding.update({
        where: { fundingId: funding.fundingId },
        data: {
          status: WalletFundingStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message
              : 'Gateway initialization failed',
        },
      });

      throw error;
    }
  }

  async confirmIfFunding(input: FundingConfirmationInput) {
    const funding = await this.prisma.walletFunding.findUnique({
      where: { gatewayReference: input.reference },
      select: { fundingId: true },
    });

    if (!funding) {
      return null;
    }

    return this.confirmVerified(input);
  }

  async confirmVerified(input: FundingConfirmationInput) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ funding_id: string }>
        >`
          SELECT funding_id
          FROM wallet_fundings
          WHERE gateway_reference = ${input.reference}
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new NotFoundException('Wallet funding not found');
        }

        const funding = await tx.walletFunding.findUniqueOrThrow({
          where: { gatewayReference: input.reference },
        });

        if (funding.status === WalletFundingStatus.CREDITED) {
          return {
            fundingId: funding.fundingId,
            transition: null as string | null,
          };
        }

        if (
          funding.status === WalletFundingStatus.REVIEW_REQUIRED ||
          funding.status === WalletFundingStatus.FAILED
        ) {
          return {
            fundingId: funding.fundingId,
            transition: null as string | null,
          };
        }

        const verified = input.verifiedPayment;
        const payload = {
          event: input.rawEvent ?? null,
          verification: verified.raw ?? null,
        } as Prisma.InputJsonValue;

        if (verified.status === 'PENDING') {
          await tx.walletFunding.update({
            where: { fundingId: funding.fundingId },
            data: {
              status: WalletFundingStatus.PROCESSING,
              providerTransactionId:
                verified.providerTransactionId ?? funding.providerTransactionId,
              lastVerifiedAt: verified.verifiedAt,
              verificationPayload: payload,
            },
          });

          return {
            fundingId: funding.fundingId,
            transition: 'PROCESSING',
          };
        }

        if (verified.status === 'FAILED') {
          await tx.walletFunding.update({
            where: { fundingId: funding.fundingId },
            data: {
              status: WalletFundingStatus.FAILED,
              providerTransactionId:
                verified.providerTransactionId ?? funding.providerTransactionId,
              lastVerifiedAt: verified.verifiedAt,
              failureReason: 'PROVIDER_VERIFIED_FAILED',
              verificationPayload: payload,
            },
          });

          return {
            fundingId: funding.fundingId,
            transition: 'FAILED',
          };
        }

        const mismatches: string[] = [];

        if (verified.reference !== funding.gatewayReference) {
          mismatches.push(
            `REFERENCE expected=${funding.gatewayReference} actual=${verified.reference}`,
          );
        }

        if (verified.gateway !== funding.gateway) {
          mismatches.push(
            `GATEWAY expected=${funding.gateway} actual=${verified.gateway}`,
          );
        }

        if (verified.currency !== funding.currency) {
          mismatches.push(
            `CURRENCY expected=${funding.currency} actual=${verified.currency ?? 'NULL'}`,
          );
        }

        if (
          verified.amountNgn === null ||
          verified.amountNgn !== funding.amountNgn
        ) {
          mismatches.push(
            `AMOUNT expected=${funding.amountNgn} actual=${verified.amountNgn ?? 'NULL'}`,
          );
        }

        if (mismatches.length > 0) {
          await tx.walletFunding.update({
            where: { fundingId: funding.fundingId },
            data: {
              status: WalletFundingStatus.REVIEW_REQUIRED,
              providerTransactionId:
                verified.providerTransactionId ?? funding.providerTransactionId,
              lastVerifiedAt: verified.verifiedAt,
              failureReason: `VERIFICATION_MISMATCH: ${mismatches.join('; ')}`,
              verificationPayload: payload,
            },
          });

          return {
            fundingId: funding.fundingId,
            transition: 'REVIEW_REQUIRED',
          };
        }

        const clearingCode = this.clearingAccountCode(funding.gateway);

        const clearingAccount = await tx.ledgerAccount.findUnique({
          where: { code: clearingCode },
        });

        if (!clearingAccount) {
          throw new ConflictException(
            `Ledger clearing account ${clearingCode} does not exist`,
          );
        }

        const journal = await this.wallets.creditInTransaction(tx, {
          walletId: funding.walletId,
          amountNgn: funding.amountNgn,
          counterAccountId: clearingAccount.accountId,
          idempotencyKey: `WALLET-FUNDING:${funding.fundingId}`,
          kind: LedgerTransactionKind.FUNDING,
          referenceType: 'WalletFunding',
          referenceId: funding.fundingId,
          description: `Wallet funding ${funding.gatewayReference}`,
          occurredAt: verified.paidAt ?? verified.verifiedAt,
          metadata: {
            gateway: funding.gateway,
            gatewayReference: funding.gatewayReference,
            providerTransactionId: verified.providerTransactionId,
          },
        });

        await tx.walletFunding.update({
          where: { fundingId: funding.fundingId },
          data: {
            status: WalletFundingStatus.CREDITED,
            providerTransactionId: verified.providerTransactionId,
            ledgerTxnId: journal.ledgerTxnId,
            lastVerifiedAt: verified.verifiedAt,
            creditedAt: new Date(),
            failureReason: null,
            verificationPayload: payload,
          },
        });

        return {
          fundingId: funding.fundingId,
          transition: 'CREDITED',
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (result.transition) {
      const funding = await this.prisma.walletFunding.findUniqueOrThrow({
        where: { fundingId: result.fundingId },
      });

      const severity =
        result.transition === 'REVIEW_REQUIRED'
          ? AuditSeverity.CRITICAL
          : result.transition === 'FAILED'
            ? AuditSeverity.WARNING
            : AuditSeverity.INFO;

      await this.audit.write({
        severity,
        actor: { type: AuditActorType.SYSTEM },
        action: `WALLET_FUNDING_${result.transition}`,
        resource: { type: 'WalletFunding', id: result.fundingId },
        metadata: {
          reference: funding.gatewayReference,
          gateway: funding.gateway,
          amountNgn: funding.amountNgn,
          walletId: funding.walletId,
          failureReason: funding.failureReason,
        },
      });
    }

    return this.getFundingView(result.fundingId);
  }

  async statusForCustomer(
    userId: string,
    reference: string,
    transactionId?: string,
  ) {
    const funding = await this.findCustomerFunding(userId, reference);

    if (
      funding.status === WalletFundingStatus.CREDITED ||
      funding.status === WalletFundingStatus.FAILED ||
      funding.status === WalletFundingStatus.REVIEW_REQUIRED
    ) {
      return this.getFundingView(funding.fundingId);
    }

    let verified: VerifiedProviderPayment | null = null;

    if (funding.gateway === PaymentGateway.PAYSTACK) {
      verified = await this.verification.verifyPaystack(
        funding.gatewayReference,
      );
    } else if (funding.gateway === PaymentGateway.FLUTTERWAVE) {
      const providerId =
        transactionId?.trim() ||
        funding.providerTransactionId;

      if (!providerId) {
        return this.getFundingView(funding.fundingId);
      }

      verified = await this.verification.verifyFlutterwave(providerId);
    }

    if (!verified) {
      return this.getFundingView(funding.fundingId);
    }

    return this.confirmVerified({
      reference: funding.gatewayReference,
      verifiedPayment: verified,
    });
  }

  async historyForCustomer(
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { walletId: true },
    });

    if (!wallet) {
      return {
        page: safePage,
        pageSize: safePageSize,
        total: 0,
        fundings: [],
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.walletFunding.findMany({
        where: { walletId: wallet.walletId },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.walletFunding.count({
        where: { walletId: wallet.walletId },
      }),
    ]);

    return {
      page: safePage,
      pageSize: safePageSize,
      total,
      fundings: rows.map((row) => this.mapFunding(row)),
    };
  }

  async listReviewRequired() {
    const rows = await this.prisma.walletFunding.findMany({
      where: { status: WalletFundingStatus.REVIEW_REQUIRED },
      include: {
        wallet: {
          select: {
            userId: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return {
      fundings: rows.map((row) => ({
        ...this.mapFunding(row),
        userId: row.wallet.userId,
        walletStatus: row.wallet.status,
      })),
    };
  }

  async refreshForFinance(
    fundingId: string,
    transactionId?: string,
  ) {
    const funding = await this.prisma.walletFunding.findUnique({
      where: { fundingId },
    });

    if (!funding) {
      throw new NotFoundException('Wallet funding not found');
    }

    /*
     * REVIEW_REQUIRED is intentionally not auto-credited.
     * Finance may inspect it, but mismatched money needs a
     * separate resolution/refund process.
     */
    if (funding.status === WalletFundingStatus.REVIEW_REQUIRED) {
      return this.getFundingView(fundingId);
    }

    if (
      funding.status === WalletFundingStatus.CREDITED ||
      funding.status === WalletFundingStatus.FAILED
    ) {
      return this.getFundingView(fundingId);
    }

    let verified: VerifiedProviderPayment | null = null;

    if (funding.gateway === PaymentGateway.PAYSTACK) {
      verified = await this.verification.verifyPaystack(
        funding.gatewayReference,
      );
    } else if (funding.gateway === PaymentGateway.FLUTTERWAVE) {
      const providerId =
        transactionId?.trim() ||
        funding.providerTransactionId;

      if (!providerId) {
        throw new ConflictException(
          'Flutterwave provider transaction ID is not known yet',
        );
      }

      verified = await this.verification.verifyFlutterwave(providerId);
    }

    if (!verified) {
      return this.getFundingView(fundingId);
    }

    return this.confirmVerified({
      reference: funding.gatewayReference,
      verifiedPayment: verified,
    });
  }

  private async initializeWithFallback(
    fundingId: string,
    input: Parameters<PaymentGatewayDriver['initialize']>[0],
  ) {
    try {
      const result = await this.paystack.initialize(input);

      if (result.gatewayReference !== input.reference) {
        throw new ConflictException('Paystack returned an unexpected reference');
      }

      return {
        ...result,
        gateway: PaymentGateway.PAYSTACK,
      };
    } catch (paystackError) {
      this.logger.warn(
        `Paystack wallet funding init failed, falling back to Flutterwave: ${
          paystackError instanceof Error
            ? paystackError.message
            : 'unknown'
        }`,
      );

      const result = await this.flutterwave.initialize(input);

      if (result.gatewayReference !== input.reference) {
        throw new ConflictException(
          'Flutterwave returned an unexpected reference',
        );
      }

      await this.prisma.walletFunding.update({
        where: { fundingId },
        data: { gateway: PaymentGateway.FLUTTERWAVE },
      });

      return {
        ...result,
        gateway: PaymentGateway.FLUTTERWAVE,
      };
    }
  }

  private async findCustomerFunding(
    userId: string,
    reference: string,
  ) {
    const funding = await this.prisma.walletFunding.findFirst({
      where: {
        gatewayReference: reference,
        wallet: { userId },
      },
    });

    if (!funding) {
      throw new NotFoundException('Wallet funding not found');
    }

    return funding;
  }

  private async getFundingView(fundingId: string) {
    const funding = await this.prisma.walletFunding.findUniqueOrThrow({
      where: { fundingId },
    });

    return this.mapFunding(funding);
  }

  private mapFunding(funding: {
    fundingId: string;
    walletId: string;
    gatewayReference: string;
    gateway: PaymentGateway;
    amountNgn: number;
    currency: string;
    status: WalletFundingStatus;
    providerTransactionId: string | null;
    ledgerTxnId: string | null;
    failureReason: string | null;
    initiatedAt: Date;
    lastVerifiedAt: Date | null;
    creditedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      fundingId: funding.fundingId,
      walletId: funding.walletId,
      reference: funding.gatewayReference,
      gateway: funding.gateway,
      amountNgn: funding.amountNgn,
      currency: funding.currency,
      status: funding.status,
      providerTransactionId: funding.providerTransactionId,
      ledgerTxnId: funding.ledgerTxnId,
      failureReason: funding.failureReason,
      initiatedAt: funding.initiatedAt.toISOString(),
      lastVerifiedAt: funding.lastVerifiedAt?.toISOString() ?? null,
      creditedAt: funding.creditedAt?.toISOString() ?? null,
      createdAt: funding.createdAt.toISOString(),
      updatedAt: funding.updatedAt.toISOString(),
    };
  }

  private validateFundingAmount(amountNgn: number) {
    if (!Number.isSafeInteger(amountNgn)) {
      throw new BadRequestException(
        'Wallet funding amount must be a whole naira value',
      );
    }

    const minimum =
      this.config.get<number>('WALLET_FUNDING_MIN_NGN') ?? 100;

    const maximum =
      this.config.get<number>('WALLET_FUNDING_MAX_NGN') ?? 500000;

    if (amountNgn < minimum || amountNgn > maximum) {
      throw new BadRequestException(
        `Wallet funding amount must be between ${minimum} and ${maximum} NGN`,
      );
    }
  }

  private clearingAccountCode(gateway: PaymentGateway) {
    switch (gateway) {
      case PaymentGateway.PAYSTACK:
        return SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_CLEARING;

      case PaymentGateway.FLUTTERWAVE:
        return SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_CLEARING;

      default:
        throw new ConflictException(
          `Unsupported wallet funding gateway ${gateway}`,
        );
    }
  }

  private syntheticEmail(phone: string) {
    const digits = phone.replace(/\D/g, '');
    return `${digits}@buyers.surewina.ng`;
  }
}