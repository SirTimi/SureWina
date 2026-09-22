import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AgentStatus,
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

import { MonnifyDriver } from './gateway/monnify.driver';
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

type FundingOwner = {
  ownerType: 'CUSTOMER' | 'AGENT';
  ownerId: string;

  walletId: string;

  phoneNumber: string;
  email: string | null;

  callbackBaseUrl: string;
};

@Injectable()
export class WalletFundingService {
  private readonly logger =
    new Logger(
      WalletFundingService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService,

    private readonly audit:
      AuditService,

    private readonly wallets:
      WalletService,

    private readonly monnify:
      MonnifyDriver,

    private readonly flutterwave:
      FlutterwaveDriver,

    private readonly verification:
      PaymentVerificationService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // CUSTOMER FUNDING
  // ─────────────────────────────────────────────────────────

  async initiate(
    userId: string,
    dto: InitiateWalletFundingDto,
  ) {
    this.validateFundingAmount(
      dto.amountNgn,
    );

    const user =
      await this.prisma.user.findUnique({
        where: {
          userId,
        },

        select: {
          userId:
            true,

          phoneNumber:
            true,

          email:
            true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    const wallet =
      await this.wallets.getCustomerWallet(
        userId,
      );

    return this.initiateForOwner(
      {
        ownerType:
          'CUSTOMER',

        ownerId:
          userId,

        walletId:
          wallet.walletId,

        phoneNumber:
          user.phoneNumber,

        email:
          user.email,

        callbackBaseUrl:
          this.cleanBaseUrl(
            this.config.getOrThrow<string>(
              'PAYMENT_CALLBACK_BASE_URL',
            ),
          ),
      },
      dto,
    );
  }


  // ─────────────────────────────────────────────────────────
  // SHARED INITIATION
  // ─────────────────────────────────────────────────────────

  private async initiateForOwner(
    owner: FundingOwner,
    dto: InitiateWalletFundingDto,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          walletId:
            owner.walletId,
        },

        select: {
          walletId:
            true,

          status:
            true,
        },
      });

    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found',
      );
    }

    if (
      wallet.status !==
      'ACTIVE'
    ) {
      throw new ConflictException(
        `Wallet is ${wallet.status}`,
      );
    }

    const reference =
      `SW-WAL-${randomUUID()}`;

    const selectedGateway =
      dto.gateway ===
      'MONNIFY'
        ? PaymentGateway.MONNIFY
        : PaymentGateway.FLUTTERWAVE;

    const funding =
      await this.prisma.walletFunding.create({
        data: {
          walletId:
            owner.walletId,

          gatewayReference:
            reference,

          gateway:
            selectedGateway,

          amountNgn:
            dto.amountNgn,

          currency:
            'NGN',

          status:
            WalletFundingStatus.PENDING,
        },
      });

    const email =
      dto.email
        ?.trim()
        .toLowerCase() ??
      owner.email
        ?.trim()
        .toLowerCase() ??
      this.syntheticEmail(
        owner.phoneNumber,
      );

    try {
      const initialized =
        await this.initializeChosenGateway(
          selectedGateway,
          {
            amountKobo:
              dto.amountNgn *
              100,

            reference,

            email,

            callbackUrl:
              `${owner.callbackBaseUrl}/wallet/funding/callback`,

            metadata: {
              purpose:
                'WALLET_FUNDING',

              fundingId:
                funding.fundingId,

              walletId:
                owner.walletId,

              ownerType:
                owner.ownerType,

              ownerId:
                owner.ownerId,

              ...(owner.ownerType ===
              'CUSTOMER'
                ? {
                    userId:
                      owner.ownerId,
                  }
                : {
                    agentId:
                      owner.ownerId,
                  }),
            },
          },
        );

      await this.audit.write({
        severity:
          AuditSeverity.INFO,

        actor: {
          type:
            owner.ownerType === 'CUSTOMER'
              ? AuditActorType.CUSTOMER
              : AuditActorType.AGENT,

          id:
            owner.ownerId,
        },

        action:
          'WALLET_FUNDING_INITIATED',

        resource: {
          type:
            'WalletFunding',

          id:
            funding.fundingId,
        },

        metadata: {
          reference,

          gateway:
            initialized.gateway,

          amountNgn:
            dto.amountNgn,

          walletId:
            owner.walletId,

          ownerType:
            owner.ownerType,

          ownerId:
            owner.ownerId,
        },
      });

      return {
        fundingId:
          funding.fundingId,

        walletId:
          owner.walletId,

        reference,

        gateway:
          initialized.gateway,

        amountNgn:
          dto.amountNgn,

        authorizationUrl:
          initialized.authorizationUrl,

        status:
          WalletFundingStatus.PENDING,
      };
    } catch (error) {
      await this.prisma.walletFunding.update({
        where: {
          fundingId:
            funding.fundingId,
        },

        data: {
          status:
            WalletFundingStatus.FAILED,

          failureReason:
            error instanceof Error
              ? error.message
              : 'Gateway initialization failed',
        },
      });

      throw error;
    }
  }

  async initiateForAgent(
    agentId: string,
    dto: InitiateWalletFundingDto,
  ) {
    this.validateFundingAmount(dto.amountNgn);

    const agent = await this.prisma.agent.findUnique({
      where: { agentId },
      select: {
        agentId: true,
        status: true,
        phoneNumber: true,
        email: true,
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.status !== AgentStatus.ACTIVE) {
      throw new ConflictException('Agent account is not active');
    }

    const wallet = await this.wallets.ensureAgentWallet(agentId);

    if (wallet.status !== 'ACTIVE') {
      throw new ConflictException(`Wallet is ${wallet.status}`);
    }

    const reference = `SW-WAL-${randomUUID()}`;

    const selectedGateway =
      dto.gateway === 'MONNIFY'
        ? PaymentGateway.MONNIFY
        : PaymentGateway.FLUTTERWAVE;

    const funding = await this.prisma.walletFunding.create({
      data: {
        walletId: wallet.walletId,
        gatewayReference: reference,
        gateway: selectedGateway,
        amountNgn: dto.amountNgn,
        currency: 'NGN',
        status: WalletFundingStatus.PENDING,
      },
    });

    const email =
      dto.email?.trim().toLowerCase() ??
      agent.email?.trim().toLowerCase() ??
      this.syntheticEmail(agent.phoneNumber);

    try {
      const callbackBaseUrl =
        this.config
          .getOrThrow<string>('AGENT_WEB_BASE_URL')
          .replace(/\/+$/, '');

      const initialized = await this.initializeChosenGateway(
        selectedGateway,
        {
          amountKobo: dto.amountNgn * 100,
          reference,
          email,
          callbackUrl: `${callbackBaseUrl}/wallet/funding/callback`,
          metadata: {
            purpose: 'WALLET_FUNDING',
            fundingId: funding.fundingId,
            walletId: wallet.walletId,
            ownerType: 'AGENT',
            agentId,
          },
        },
      );

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.AGENT, id: agentId },
        action: 'WALLET_FUNDING_INITIATED',
        resource: { type: 'WalletFunding', id: funding.fundingId },
        metadata: {
          reference,
          gateway: initialized.gateway,
          amountNgn: dto.amountNgn,
          walletId: wallet.walletId,
          ownerType: 'AGENT',
          agentId,
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

  // ─────────────────────────────────────────────────────────
  // PROVIDER CONFIRMATION
  // ─────────────────────────────────────────────────────────

  async confirmIfFunding(
    input:
      FundingConfirmationInput,
  ) {
    const funding =
      await this.prisma.walletFunding.findUnique({
        where: {
          gatewayReference:
            input.reference,
        },

        select: {
          fundingId:
            true,
        },
      });

    if (!funding) {
      return null;
    }

    return this.confirmVerified(
      input,
    );
  }

  async confirmVerified(
    input:
      FundingConfirmationInput,
  ) {
    const result =
      await this.prisma.$transaction(
        async (
          tx,
        ) => {
          const locked =
            await tx.$queryRaw<
              Array<{
                funding_id: string;
              }>
            >`
              SELECT funding_id
              FROM wallet_fundings
              WHERE gateway_reference = ${input.reference}
              FOR UPDATE
            `;

          if (
            locked.length ===
            0
          ) {
            throw new NotFoundException(
              'Wallet funding not found',
            );
          }

          const funding =
            await tx.walletFunding.findUniqueOrThrow({
              where: {
                gatewayReference:
                  input.reference,
              },
            });

          if (
            funding.status ===
            WalletFundingStatus.CREDITED
          ) {
            return {
              fundingId:
                funding.fundingId,

              transition:
                null as
                  | string
                  | null,
            };
          }

          if (
            funding.status ===
              WalletFundingStatus.REVIEW_REQUIRED ||
            funding.status ===
              WalletFundingStatus.FAILED
          ) {
            return {
              fundingId:
                funding.fundingId,

              transition:
                null as
                  | string
                  | null,
            };
          }

          const verified =
            input.verifiedPayment;

          const payload = {
            event:
              input.rawEvent ??
              null,

            verification:
              verified.raw ??
              null,
          } as Prisma.InputJsonValue;

          if (
            verified.status ===
            'PENDING'
          ) {
            await tx.walletFunding.update({
              where: {
                fundingId:
                  funding.fundingId,
              },

              data: {
                status:
                  WalletFundingStatus.PROCESSING,

                providerTransactionId:
                  verified.providerTransactionId ??
                  funding.providerTransactionId,

                lastVerifiedAt:
                  verified.verifiedAt,

                verificationPayload:
                  payload,
              },
            });

            return {
              fundingId:
                funding.fundingId,

              transition:
                'PROCESSING',
            };
          }

          if (
            verified.status ===
            'FAILED'
          ) {
            await tx.walletFunding.update({
              where: {
                fundingId:
                  funding.fundingId,
              },

              data: {
                status:
                  WalletFundingStatus.FAILED,

                providerTransactionId:
                  verified.providerTransactionId ??
                  funding.providerTransactionId,

                lastVerifiedAt:
                  verified.verifiedAt,

                failureReason:
                  'PROVIDER_VERIFIED_FAILED',

                verificationPayload:
                  payload,
              },
            });

            return {
              fundingId:
                funding.fundingId,

              transition:
                'FAILED',
            };
          }

          const mismatches:
            string[] = [];

          if (
            verified.reference !==
            funding.gatewayReference
          ) {
            mismatches.push(
              `REFERENCE expected=${funding.gatewayReference} actual=${verified.reference}`,
            );
          }

          if (
            verified.gateway !==
            funding.gateway
          ) {
            mismatches.push(
              `GATEWAY expected=${funding.gateway} actual=${verified.gateway}`,
            );
          }

          if (
            verified.currency !==
            funding.currency
          ) {
            mismatches.push(
              `CURRENCY expected=${funding.currency} actual=${verified.currency ?? 'NULL'}`,
            );
          }

          if (
            verified.amountNgn ===
              null ||
            verified.amountNgn !==
              funding.amountNgn
          ) {
            mismatches.push(
              `AMOUNT expected=${funding.amountNgn} actual=${verified.amountNgn ?? 'NULL'}`,
            );
          }

          if (
            mismatches.length >
            0
          ) {
            await tx.walletFunding.update({
              where: {
                fundingId:
                  funding.fundingId,
              },

              data: {
                status:
                  WalletFundingStatus.REVIEW_REQUIRED,

                providerTransactionId:
                  verified.providerTransactionId ??
                  funding.providerTransactionId,

                lastVerifiedAt:
                  verified.verifiedAt,

                failureReason:
                  `VERIFICATION_MISMATCH: ${mismatches.join('; ')}`,

                verificationPayload:
                  payload,
              },
            });

            return {
              fundingId:
                funding.fundingId,

              transition:
                'REVIEW_REQUIRED',
            };
          }

          const clearingCode =
            this.clearingAccountCode(
              funding.gateway,
            );

          const clearingAccount =
            await tx.ledgerAccount.findUnique({
              where: {
                code:
                  clearingCode,
              },
            });

          if (
            !clearingAccount
          ) {
            throw new ConflictException(
              `Ledger clearing account ${clearingCode} does not exist`,
            );
          }

          const journal =
            await this.wallets.creditInTransaction(
              tx,
              {
                walletId:
                  funding.walletId,

                amountNgn:
                  funding.amountNgn,

                counterAccountId:
                  clearingAccount.accountId,

                idempotencyKey:
                  `WALLET-FUNDING:${funding.fundingId}`,

                kind:
                  LedgerTransactionKind.FUNDING,

                referenceType:
                  'WalletFunding',

                referenceId:
                  funding.fundingId,

                description:
                  `Wallet funding ${funding.gatewayReference}`,

                occurredAt:
                  verified.paidAt ??
                  verified.verifiedAt,

                metadata: {
                  gateway:
                    funding.gateway,

                  gatewayReference:
                    funding.gatewayReference,

                  providerTransactionId:
                    verified.providerTransactionId,
                },
              },
            );

          await tx.walletFunding.update({
            where: {
              fundingId:
                funding.fundingId,
            },

            data: {
              status:
                WalletFundingStatus.CREDITED,

              providerTransactionId:
                verified.providerTransactionId,

              ledgerTxnId:
                journal.ledgerTxnId,

              lastVerifiedAt:
                verified.verifiedAt,

              creditedAt:
                new Date(),

              failureReason:
                null,

              verificationPayload:
                payload,
            },
          });

          return {
            fundingId:
              funding.fundingId,

            transition:
              'CREDITED',
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    if (
      result.transition
    ) {
      const funding =
        await this.prisma.walletFunding.findUniqueOrThrow({
          where: {
            fundingId:
              result.fundingId,
          },

          include: {
            wallet: {
              select: {
                ownerType:
                  true,

                userId:
                  true,

                agentId:
                  true,
              },
            },
          },
        });

      const severity =
        result.transition ===
        'REVIEW_REQUIRED'
          ? AuditSeverity.CRITICAL
          : result.transition ===
              'FAILED'
            ? AuditSeverity.WARNING
            : AuditSeverity.INFO;

      await this.audit.write({
        severity,

        actor: {
          type:
            AuditActorType.SYSTEM,
        },

        action:
          `WALLET_FUNDING_${result.transition}`,

        resource: {
          type:
            'WalletFunding',

          id:
            result.fundingId,
        },

        metadata: {
          reference:
            funding.gatewayReference,

          gateway:
            funding.gateway,

          amountNgn:
            funding.amountNgn,

          walletId:
            funding.walletId,

          ownerType:
            funding.wallet.ownerType,

          ownerId:
            funding.wallet.userId ??
            funding.wallet.agentId,

          failureReason:
            funding.failureReason,
        },
      });
    }

    return this.getFundingView(
      result.fundingId,
    );
  }

  // ─────────────────────────────────────────────────────────
  // CUSTOMER STATUS / HISTORY
  // ─────────────────────────────────────────────────────────

  async statusForCustomer(
    userId: string,
    reference: string,
    transactionId?: string,
  ) {
    const funding =
      await this.findCustomerFunding(
        userId,
        reference,
      );

    return this.resolveFundingStatus(
      funding,
      transactionId,
    );
  }

  async historyForCustomer(
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          userId,
        },

        select: {
          walletId:
            true,
        },
      });

    return this.historyForWallet(
      wallet?.walletId ??
        null,
      page,
      pageSize,
    );
  }

  // ─────────────────────────────────────────────────────────
  // AGENT STATUS / HISTORY
  // ─────────────────────────────────────────────────────────


  async historyForAgent(
    agentId: string,
    page = 1,
    pageSize = 20,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          agentId,
        },

        select: {
          walletId:
            true,
        },
      });

    return this.historyForWallet(
      wallet?.walletId ??
        null,
      page,
      pageSize,
    );
  }

  private async resolveFundingStatus(
    funding: {
      fundingId: string;
      gatewayReference: string;
      gateway: PaymentGateway;
      status: WalletFundingStatus;
      providerTransactionId: string | null;
    },
    transactionId?: string,
  ) {
    if (
      funding.status ===
        WalletFundingStatus.CREDITED ||
      funding.status ===
        WalletFundingStatus.FAILED ||
      funding.status ===
        WalletFundingStatus.REVIEW_REQUIRED
    ) {
      return this.getFundingView(
        funding.fundingId,
      );
    }

    let verified:
      VerifiedProviderPayment |
      null =
      null;

    if (
      funding.gateway ===
      PaymentGateway.MONNIFY
    ) {
      verified =
        await this.verification.verifyMonnify(
          funding.gatewayReference,
        );
    } else if (
      funding.gateway ===
      PaymentGateway.FLUTTERWAVE
    ) {
      const providerId =
        transactionId?.trim() ||
        funding.providerTransactionId;

      if (
        !providerId
      ) {
        return this.getFundingView(
          funding.fundingId,
        );
      }

      verified =
        await this.verification.verifyFlutterwave(
          providerId,
        );
    }

    if (!verified) {
      return this.getFundingView(
        funding.fundingId,
      );
    }

    return this.confirmVerified({
      reference:
        funding.gatewayReference,

      verifiedPayment:
        verified,
    });
  }

  async statusForAgent(
    agentId: string,
    reference: string,
    transactionId?: string,
  ) {
    const funding = await this.findAgentFunding(agentId, reference);

    if (
      funding.status === WalletFundingStatus.CREDITED ||
      funding.status === WalletFundingStatus.FAILED ||
      funding.status === WalletFundingStatus.REVIEW_REQUIRED
    ) {
      return this.getFundingView(funding.fundingId);
    }

    let verified: VerifiedProviderPayment | null = null;

    if (funding.gateway === PaymentGateway.MONNIFY) {
      verified = await this.verification.verifyMonnify(
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

  async historyForFinanceWallet(
    walletId: string,
    page = 1,
    pageSize = 20,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        walletId,
      },
      select: {
        walletId: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found',
      );
    }

    return this.historyForWallet(
      walletId,
      page,
      pageSize,
    );
  }

  private async historyForWallet(
    walletId: string | null,
    page: number,
    pageSize: number,
  ) {
    const safePage =
      Math.max(
        1,
        page,
      );

    const safePageSize =
      Math.min(
        100,
        Math.max(
          1,
          pageSize,
        ),
      );

    if (!walletId) {
      return {
        page:
          safePage,

        pageSize:
          safePageSize,

        total:
          0,

        fundings:
          [],
      };
    }

    const [
      rows,
      total,
    ] =
      await this.prisma.$transaction([
        this.prisma.walletFunding.findMany({
          where: {
            walletId,
          },

          orderBy: {
            createdAt:
              'desc',
          },

          skip:
            (safePage -
              1) *
            safePageSize,

          take:
            safePageSize,
        }),

        this.prisma.walletFunding.count({
          where: {
            walletId,
          },
        }),
      ]);

    return {
      page:
        safePage,

      pageSize:
        safePageSize,

      total,

      fundings:
        rows.map(
          (
            row,
          ) =>
            this.mapFunding(
              row,
            ),
        ),
    };
  }

  async listReviewRequired() {
    const rows = await this.prisma.walletFunding.findMany({
      where: { status: WalletFundingStatus.REVIEW_REQUIRED },
      include: {
        wallet: {
          select: {
            userId: true,
            agentId: true,
            ownerType: true,
            status: true,
            user: {
              select: {
                phoneNumber: true,
                displayName: true,
              },
            },
            agent: {
              select: {
                agentCode: true,
                fullName: true,
              },
            },
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
        agentId: row.wallet.agentId,
        ownerType: row.wallet.ownerType,
        ownerName:
          row.wallet.user?.displayName ??
          row.wallet.agent?.fullName ??
          null,
        ownerIdentifier:
          row.wallet.user?.phoneNumber ??
          row.wallet.agent?.agentCode ??
          null,
        walletStatus: row.wallet.status,
      })),
    };
  }

  async refreshForFinance(
    fundingId: string,
    transactionId?: string,
  ) {
    const funding =
      await this.prisma.walletFunding.findUnique({
        where: {
          fundingId,
        },
      });

    if (!funding) {
      throw new NotFoundException(
        'Wallet funding not found',
      );
    }

    if (
      funding.status ===
      WalletFundingStatus.REVIEW_REQUIRED
    ) {
      return this.getFundingView(
        fundingId,
      );
    }

    if (
      funding.status ===
        WalletFundingStatus.CREDITED ||
      funding.status ===
        WalletFundingStatus.FAILED
    ) {
      return this.getFundingView(
        fundingId,
      );
    }

    let verified:
      VerifiedProviderPayment |
      null =
      null;

    if (
      funding.gateway ===
      PaymentGateway.MONNIFY
    ) {
      verified =
        await this.verification.verifyMonnify(
          funding.gatewayReference,
        );
    } else if (
      funding.gateway ===
      PaymentGateway.FLUTTERWAVE
    ) {
      const providerId =
        transactionId?.trim() ||
        funding.providerTransactionId;

      if (
        !providerId
      ) {
        throw new ConflictException(
          'Flutterwave provider transaction ID is not known yet',
        );
      }

      verified =
        await this.verification.verifyFlutterwave(
          providerId,
        );
    }

    if (!verified) {
      return this.getFundingView(
        fundingId,
      );
    }

    return this.confirmVerified({
      reference:
        funding.gatewayReference,

      verifiedPayment:
        verified,
    });
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private async initializeChosenGateway(
    gateway: PaymentGateway,
    input:
      Parameters<
        PaymentGatewayDriver['initialize']
      >[0],
  ) {
    const driver =
      gateway ===
      PaymentGateway.MONNIFY
        ? this.monnify
        : gateway ===
            PaymentGateway.FLUTTERWAVE
          ? this.flutterwave
          : null;

    if (!driver) {
      throw new BadRequestException(
        'Wallet funding gateway must be MONNIFY or FLUTTERWAVE',
      );
    }

    const result =
      await driver.initialize(
        input,
      );

    if (
      result.gatewayReference !==
      input.reference
    ) {
      throw new ConflictException(
        `${gateway} returned an unexpected reference`,
      );
    }

    return {
      ...result,
      gateway,
    };
  }

  private async findCustomerFunding(
    userId: string,
    reference: string,
  ) {
    const funding =
      await this.prisma.walletFunding.findFirst({
        where: {
          gatewayReference:
            reference,

          wallet: {
            userId,
          },
        },
      });

    if (!funding) {
      throw new NotFoundException(
        'Wallet funding not found',
      );
    }

    return funding;
  }

  private async findAgentFunding(
    agentId: string,
    reference: string,
  ) {
    const funding =
      await this.prisma.walletFunding.findFirst({
        where: {
          gatewayReference:
            reference,

          wallet: {
            agentId,
          },
        },
      });

    if (!funding) {
      throw new NotFoundException(
        'Wallet funding not found',
      );
    }

    return funding;
  }

  private async getFundingView(
    fundingId: string,
  ) {
    const funding =
      await this.prisma.walletFunding.findUniqueOrThrow({
        where: {
          fundingId,
        },
      });

    return this.mapFunding(
      funding,
    );
  }

  private mapFunding(
    funding: {
      fundingId: string;
      walletId: string;
      gatewayReference: string;
      gateway: PaymentGateway;
      amountNgn: number;
      currency: string;
      status: WalletFundingStatus;
      providerTransactionId:
        string | null;
      ledgerTxnId:
        string | null;
      failureReason:
        string | null;
      initiatedAt:
        Date;
      lastVerifiedAt:
        Date | null;
      creditedAt:
        Date | null;
      createdAt:
        Date;
      updatedAt:
        Date;
    },
  ) {
    return {
      fundingId:
        funding.fundingId,

      walletId:
        funding.walletId,

      reference:
        funding.gatewayReference,

      gateway:
        funding.gateway,

      amountNgn:
        funding.amountNgn,

      currency:
        funding.currency,

      status:
        funding.status,

      providerTransactionId:
        funding.providerTransactionId,

      ledgerTxnId:
        funding.ledgerTxnId,

      failureReason:
        funding.failureReason,

      initiatedAt:
        funding.initiatedAt.toISOString(),

      lastVerifiedAt:
        funding.lastVerifiedAt
          ?.toISOString() ??
        null,

      creditedAt:
        funding.creditedAt
          ?.toISOString() ??
        null,

      createdAt:
        funding.createdAt.toISOString(),

      updatedAt:
        funding.updatedAt.toISOString(),
    };
  }

  private validateFundingAmount(
    amountNgn: number,
  ) {
    if (
      !Number.isSafeInteger(
        amountNgn,
      )
    ) {
      throw new BadRequestException(
        'Wallet funding amount must be a whole naira value',
      );
    }

    const minimum =
      this.config.get<number>(
        'WALLET_FUNDING_MIN_NGN',
      ) ??
      100;

    const maximum =
      this.config.get<number>(
        'WALLET_FUNDING_MAX_NGN',
      ) ??
      500000;

    if (
      amountNgn <
        minimum ||
      amountNgn >
        maximum
    ) {
      throw new BadRequestException(
        `Wallet funding amount must be between ${minimum} and ${maximum} NGN`,
      );
    }
  }

  private clearingAccountCode(
    gateway:
      PaymentGateway,
  ) {
    switch (
      gateway
    ) {
      case PaymentGateway.MONNIFY:
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .MONNIFY_COLLECTION_CLEARING;

      case PaymentGateway.FLUTTERWAVE:
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .FLUTTERWAVE_CLEARING;

      default:
        throw new ConflictException(
          `Unsupported wallet funding gateway ${gateway}`,
        );
    }
  }

  private syntheticEmail(
    phone: string,
  ) {
    const digits =
      phone.replace(
        /\D/g,
        '',
      );

    return `${digits}@buyers.surewina.ng`;
  }

  private cleanBaseUrl(
    value: string,
  ) {
    return value.replace(
      /\/+$/,
      '',
    );
  }
}