import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AgentStatus,
  DrawStatus,
  FinancialMigrationRunStatus,
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerOwnerType,
  LedgerTransactionKind,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { WalletService } from '../wallet/wallet.service';

const TEST_CASH_ACCOUNT_CODE =
  'TEST:ROLLOUT:CASH';

@Injectable()
export class RolloutSmokeService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(LedgerService)
    private readonly ledger: LedgerService,
    @Inject(WalletService)
    private readonly wallets: WalletService,
  ) {}

  async candidates() {
    this.assertLocalOnly();

    const now = new Date();

    const [customers, agents, draws, migration] =
      await Promise.all([
        this.prisma.user.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
          take: 20,
          select: {
            userId: true,
            phoneNumber: true,
            email: true,
            displayName: true,
            kycStatus: true,
            wallet: {
              select: {
                walletId: true,
                status: true,
              },
            },
          },
        }),
        this.prisma.agent.findMany({
          where: {
            status:
              AgentStatus.ACTIVE,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 20,
          select: {
            agentId: true,
            agentCode: true,
            phoneNumber: true,
            fullName: true,
            tier: true,
            commissionRate: true,
            wallet: {
              select: {
                walletId: true,
                status: true,
              },
            },
          },
        }),
        this.prisma.draw.findMany({
          where: {
            status:
              DrawStatus.ACTIVE,
            cutoffAt: {
              gt: now,
            },
          },
          orderBy: {
            cutoffAt: 'asc',
          },
          take: 20,
          select: {
            drawId: true,
            drawCode: true,
            drawType: true,
            ticketPriceNgn: true,
            scheduledAt: true,
            cutoffAt: true,
          },
        }),
        this.prisma.financialMigrationRun.findFirst({
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            runId: true,
            status: true,
            finalizedAt: true,
          },
        }),
      ]);

    return {
      localOnly: true,
      nodeEnv:
        this.config.get<string>('NODE_ENV') ??
        null,
      migration,
      customers,
      agents: agents.map((agent) => ({
        ...agent,
        commissionRate:
          agent.commissionRate.toString(),
      })),
      activeDraws: draws,
      instructions: {
        customer:
          'Use fund-customer with an existing customer phone.',
        agent:
          'Use fund-agent with an ACTIVE agent code.',
        note:
          'These balances are local smoke-test adjustments, not provider funding.',
      },
    };
  }

  async fundCustomer(input: {
    phone: string;
    amountNgn: number;
  }) {
    this.assertLocalOnly();
    this.validateAmount(input.amountNgn);
    await this.assertMigrationFinalized();

    const user =
      await this.prisma.user.findUnique({
        where: {
          phoneNumber:
            input.phone.trim(),
        },
        select: {
          userId: true,
          phoneNumber: true,
          email: true,
          displayName: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Customer phone not found. Run rollout:smoke candidates first.',
      );
    }

    const wallet =
      await this.wallets.ensureCustomerWallet(
        user.userId,
      );

    return this.seedWallet({
      ownerType:
        LedgerOwnerType.CUSTOMER,
      ownerId:
        user.userId,
      ownerLabel:
        user.phoneNumber,
      walletId:
        wallet.walletId,
      beforeNgn:
        wallet.availableNgn,
      amountNgn:
        input.amountNgn,
    });
  }

  async fundAgent(input: {
    agentCode: string;
    amountNgn: number;
  }) {
    this.assertLocalOnly();
    this.validateAmount(input.amountNgn);
    await this.assertMigrationFinalized();

    const agent =
      await this.prisma.agent.findUnique({
        where: {
          agentCode:
            input.agentCode.trim(),
        },
        select: {
          agentId: true,
          agentCode: true,
          phoneNumber: true,
          fullName: true,
          status: true,
        },
      });

    if (!agent) {
      throw new NotFoundException(
        'Agent code not found. Run rollout:smoke candidates first.',
      );
    }

    if (
      agent.status !==
      AgentStatus.ACTIVE
    ) {
      throw new ConflictException(
        `Agent ${agent.agentCode} is ${agent.status}; rollout smoke funding requires ACTIVE status.`,
      );
    }

    const wallet =
      await this.wallets.ensureAgentWallet(
        agent.agentId,
      );

    return this.seedWallet({
      ownerType:
        LedgerOwnerType.AGENT,
      ownerId:
        agent.agentId,
      ownerLabel:
        agent.agentCode,
      walletId:
        wallet.walletId,
      beforeNgn:
        wallet.availableNgn,
      amountNgn:
        input.amountNgn,
    });
  }

  private async seedWallet(input: {
    ownerType: LedgerOwnerType;
    ownerId: string;
    ownerLabel: string;
    walletId: string;
    beforeNgn: number;
    amountNgn: number;
  }) {
    const source =
      await this.ledger.ensureAccount({
        code:
          TEST_CASH_ACCOUNT_CODE,
        name:
          'Local Rollout Test Cash',
        accountType:
          LedgerAccountType.ASSET,
        purpose:
          LedgerAccountPurpose.BANK_CASH,
        ownerType:
          LedgerOwnerType.SYSTEM,
        ownerId:
          null,
        currency:
          'NGN',
      });

    const ownerKey =
      `${input.ownerType}:${input.ownerId}`;

    const result =
      await this.wallets.credit({
        walletId:
          input.walletId,
        amountNgn:
          input.amountNgn,
        counterAccountId:
          source.accountId,
        idempotencyKey:
          `rollout:smoke:seed:${ownerKey}`,
        kind:
          LedgerTransactionKind.ADJUSTMENT,
        referenceType:
          'RolloutSmokeSeed',
        referenceId:
          ownerKey,
        description:
          'Local rollout smoke wallet seed',
        metadata: {
          localOnly: true,
          source:
            'rollout-smoke',
          ownerType:
            input.ownerType,
          ownerId:
            input.ownerId,
          ownerLabel:
            input.ownerLabel,
        },
      });

    return {
      localOnly: true,
      providerFunding: false,
      ownerType:
        input.ownerType,
      ownerId:
        input.ownerId,
      ownerLabel:
        input.ownerLabel,
      walletId:
        input.walletId,
      amountNgn:
        input.amountNgn,
      beforeAvailableNgn:
        input.beforeNgn,
      afterAvailableNgn:
        result.wallet.availableNgn,
      ledgerTxnId:
        result.journal.ledgerTxnId,
      testCounterAccount:
        TEST_CASH_ACCOUNT_CODE,
      note:
        'This is a local-only ledger adjustment for functional smoke testing. It is not Monnify/Flutterwave funding.',
    };
  }

  private async assertMigrationFinalized() {
    const latest =
      await this.prisma.financialMigrationRun.findFirst({
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          runId: true,
          status: true,
        },
      });

    if (
      !latest ||
      latest.status !==
        FinancialMigrationRunStatus.FINALIZED
    ) {
      throw new ConflictException(
        'Phase 8 must be FINALIZED before seeding rollout smoke balances.',
      );
    }
  }

  private assertLocalOnly() {
    if (
      this.config.get<string>(
        'NODE_ENV',
      ) ===
      'production'
    ) {
      throw new ConflictException(
        'rollout:smoke is disabled when NODE_ENV=production',
      );
    }
  }

  private validateAmount(
    amountNgn: number,
  ) {
    if (
      !Number.isSafeInteger(
        amountNgn,
      ) ||
      amountNgn <=
        0 ||
      amountNgn >
        1_000_000
    ) {
      throw new ConflictException(
        'Smoke amount must be an integer between NGN 1 and NGN 1,000,000',
      );
    }
  }
}
