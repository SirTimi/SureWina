import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  FinancialMigrationRunStatus,
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerOwnerType,
  LedgerTransactionKind,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
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
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(WalletService)
    private readonly wallets: WalletService,
  ) {}

  async candidates() {
    this.assertLocalOnly();

    const now = new Date();

    const [customers, agents, draws, rolloutDraws, migration] =
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
        this.prisma.draw.findMany({
          where: {
            drawCode: {
              startsWith:
                'TEST-ROLLOUT-',
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
          select: {
            drawId: true,
            drawCode: true,
            drawType: true,
            status: true,
            ticketPriceNgn: true,
            scheduledAt: true,
            cutoffAt: true,
            seedCommit: {
              select: {
                seedHash: true,
                committedAt: true,
              },
            },
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
      rolloutDraws,
      instructions: {
        customer:
          'Use fund-customer with an existing customer phone.',
        agent:
          'Use fund-agent with an ACTIVE agent code.',
        draw:
          'If activeDraws is empty, run create-draw, then start the Engine so it can commit the seed and activate the draw.',
        note:
          'These balances are local smoke-test adjustments, not provider funding.',
      },
    };
  }

  async createDraw(input: {
    ticketPriceNgn: number;
  }) {
    this.assertLocalOnly();
    this.validateAmount(input.ticketPriceNgn);
    await this.assertMigrationFinalized();

    const now = new Date();

    const existing =
      await this.prisma.draw.findFirst({
        where: {
          drawCode: {
            startsWith:
              'TEST-ROLLOUT-',
          },
          status: {
            in: [
              DrawStatus.SCHEDULED,
              DrawStatus.ACTIVE,
            ],
          },
          cutoffAt: {
            gt: now,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          seedCommit:
            true,
        },
      });

    if (existing) {
      return {
        created:
          false,
        draw:
          existing,
        next:
          existing.status ===
            DrawStatus.ACTIVE
            ? 'Draw is ACTIVE and ready for customer/agent sale testing.'
            : 'Start the SureWina Engine. It will commit the seed and transition this SCHEDULED draw to ACTIVE.',
      };
    }

    const stamp =
      now
        .toISOString()
        .replace(
          /[-:.TZ]/g,
          '',
        )
        .slice(
          0,
          14,
        );

    const cutoffAt =
      new Date(
        now.getTime() +
          29 *
            24 *
            60 *
            60 *
            1000,
      );

    const scheduledAt =
      new Date(
        now.getTime() +
          30 *
            24 *
            60 *
            60 *
            1000,
      );

    const draw =
      await this.prisma.draw.create({
        data: {
          drawCode:
            `TEST-ROLLOUT-DAILY-${stamp}`,
          drawType:
            DrawType.DAILY_STANDARD,
          status:
            DrawStatus.SCHEDULED,
          prizeDescription:
            'Local rollout smoke prize',
          prizeValueNgn:
            10_000,
          prizeImageUrl:
            null,
          ticketPriceNgn:
            input.ticketPriceNgn,
          ticketQuota:
            100,
          scheduledAt,
          cutoffAt,
        },
      });

    await this.audit.write({
      severity:
        AuditSeverity.INFO,
      actor: {
        type:
          AuditActorType.SYSTEM,
      },
      action:
        'ROLLOUT_SMOKE_DRAW_CREATED',
      resource: {
        type:
          'Draw',
        id:
          draw.drawId,
      },
      metadata: {
        localOnly:
          true,
        drawCode:
          draw.drawCode,
        ticketPriceNgn:
          draw.ticketPriceNgn,
        cutoffAt:
          draw.cutoffAt.toISOString(),
        scheduledAt:
          draw.scheduledAt.toISOString(),
      },
    });

    return {
      created:
        true,
      draw,
      next:
        'Start the SureWina Engine. Its seed-commit and lifecycle loops will commit the seed and transition this draw from SCHEDULED to ACTIVE.',
    };
  }

  async cancelDraw(input: {
    drawCode: string;
  }) {
    this.assertLocalOnly();

    const drawCode =
      input.drawCode.trim();

    if (
      !drawCode.startsWith(
        'TEST-ROLLOUT-',
      )
    ) {
      throw new ConflictException(
        'rollout:smoke can only cancel TEST-ROLLOUT-* draws',
      );
    }

    const draw =
      await this.prisma.draw.findUnique({
        where: {
          drawCode,
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Rollout smoke draw not found',
      );
    }

    if (
      draw.status ===
        DrawStatus.COMPLETED ||
      draw.status ===
        DrawStatus.EXECUTING
    ) {
      throw new ConflictException(
        `Cannot cancel smoke draw from ${draw.status}`,
      );
    }

    if (
      draw.status ===
      DrawStatus.CANCELLED
    ) {
      return {
        cancelled:
          false,
        draw,
      };
    }

    const updated =
      await this.prisma.draw.update({
        where: {
          drawId:
            draw.drawId,
        },
        data: {
          status:
            DrawStatus.CANCELLED,
        },
      });

    await this.audit.write({
      severity:
        AuditSeverity.INFO,
      actor: {
        type:
          AuditActorType.SYSTEM,
      },
      action:
        'ROLLOUT_SMOKE_DRAW_CANCELLED',
      resource: {
        type:
          'Draw',
        id:
          draw.drawId,
      },
      metadata: {
        localOnly:
          true,
        drawCode:
          draw.drawCode,
        previousStatus:
          draw.status,
      },
    });

    return {
      cancelled:
        true,
      draw:
        updated,
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
