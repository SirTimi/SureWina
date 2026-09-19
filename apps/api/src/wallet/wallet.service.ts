import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  LedgerAccountPurpose,
  LedgerAccountStatus,
  LedgerAccountType,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  Prisma,
  WalletHoldStatus,
  WalletStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';

const WALLET_INCLUDE = {
  availableAccount: true,
  heldAccount: true,
} satisfies Prisma.WalletInclude;

type WalletRecord = Prisma.WalletGetPayload<{
  include: typeof WALLET_INCLUDE;
}>;

type WalletMovementContext = {
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
  kind: LedgerTransactionKind;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

export type WalletCreditInput = WalletMovementContext & {
  walletId: string;
  amountNgn: number;
  counterAccountId: string;
};

type WalletDebitInput = WalletMovementContext & {
  walletId: string;
  amountNgn: number;
  counterAccountId: string;
};

type ResolveHoldInput = {
  holdId: string;
  idempotencyKey: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
};

export type CreateWalletHoldInput = {
  walletId: string;
  amountNgn: number;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
  description: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

export type CaptureWalletHoldInput = {
  holdId: string;
  counterAccountId: string;
  idempotencyKey: string;
  description: string;
  kind?: LedgerTransactionKind;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  ensureCustomerWallet(userId: string) {
    return this.ensureWallet(LedgerOwnerType.CUSTOMER, userId);
  }

  ensureAgentWallet(agentId: string) {
    return this.ensureWallet(LedgerOwnerType.AGENT, agentId);
  }

  async getWallet(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletId },
      include: WALLET_INCLUDE,
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.toWalletView(wallet);
  }

  async getCustomerWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: WALLET_INCLUDE,
    });

    if (!wallet) {
      return this.ensureCustomerWallet(userId);
    }

    return this.toWalletView(wallet);
  }

  async history(walletId: string, page = 1, pageSize = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { walletId },
      select: {
        walletId: true,
        availableAccountId: true,
        heldAccountId: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const accountIds = [
      wallet.availableAccountId,
      wallet.heldAccountId,
    ];

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.ledgerTransaction.findMany({
        where: {
          entries: {
            some: {
              accountId: {
                in: accountIds,
              },
            },
          },
        },
        include: {
          entries: {
            orderBy: {
              lineNo: 'asc',
            },
            include: {
              account: {
                select: {
                  accountId: true,
                  code: true,
                  name: true,
                  purpose: true,
                },
              },
            },
          },
        },
        orderBy: [
          {
            occurredAt: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),

      this.prisma.ledgerTransaction.count({
        where: {
          entries: {
            some: {
              accountId: {
                in: accountIds,
              },
            },
          },
        },
      }),
    ]);

    return {
      page: safePage,
      pageSize: safePageSize,
      total,
      transactions: transactions.map((txn) => ({
        ledgerTxnId: txn.ledgerTxnId,
        kind: txn.kind,
        referenceType: txn.referenceType,
        referenceId: txn.referenceId,
        description: txn.description,
        totalAmountNgn: txn.totalAmountNgn,
        occurredAt: txn.occurredAt.toISOString(),
        createdAt: txn.createdAt.toISOString(),
        entries: txn.entries.map((entry) => ({
          entryId: entry.entryId,
          side: entry.side,
          amountNgn: entry.amountNgn,
          memo: entry.memo,
          account: entry.account,
          belongsToWallet: accountIds.includes(entry.accountId),
        })),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // CREDIT
  // ─────────────────────────────────────────────────────────

  async credit(input: WalletCreditInput) {
    const journal = await this.prisma.$transaction(
      (tx) => this.creditInTransaction(tx, input),
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      journal,
      wallet: await this.getWallet(input.walletId),
    };
  }

  async creditInTransaction(
    tx: Prisma.TransactionClient,
    input: WalletCreditInput,
  ) {
    this.validateAmount(input.amountNgn);

    const wallet = await this.lockWallet(
      tx,
      input.walletId,
    );

    this.assertCanReceive(wallet.status);

    this.assertExternalCounterAccount(
      wallet,
      input.counterAccountId,
    );

    return this.ledger.postInTransaction(tx, {
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      metadata: input.metadata,
      occurredAt: input.occurredAt,
      lines: [
        {
          accountId: input.counterAccountId,
          side: LedgerEntrySide.DEBIT,
          amountNgn: input.amountNgn,
          memo: input.description,
        },
        {
          accountId: wallet.availableAccountId,
          side: LedgerEntrySide.CREDIT,
          amountNgn: input.amountNgn,
          memo: input.description,
        },
      ],
    });
  }

  // ─────────────────────────────────────────────────────────
  // DEBIT
  // ─────────────────────────────────────────────────────────

  async debit(input: WalletDebitInput) {
    this.validateAmount(input.amountNgn);

    const journal = await this.prisma.$transaction(
      (tx) =>
        this.debitInTransaction(
          tx,
          input,
        ),
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      journal,
      wallet: await this.getWallet(input.walletId),
    };
  }

  async debitInTransaction(
    tx: Prisma.TransactionClient,
    input: WalletDebitInput,
  ) {
    this.validateAmount(input.amountNgn);

    const wallet = await this.lockWallet(
      tx,
      input.walletId,
    );

    this.assertCanSpend(wallet.status);

    this.assertExternalCounterAccount(
      wallet,
      input.counterAccountId,
    );

    const existing =
      await tx.ledgerTransaction.findUnique({
        where: {
          idempotencyKey:
            input.idempotencyKey.trim(),
        },
      });

    if (!existing) {
      const balances =
        await this.getBalancesInTx(
          tx,
          wallet,
        );

      if (
        balances.availableNgn <
        input.amountNgn
      ) {
        throw new ConflictException(
          'Insufficient wallet balance',
        );
      }
    }

    return this.ledger.postInTransaction(
      tx,
      {
        idempotencyKey:
          input.idempotencyKey,

        kind:
          input.kind,

        referenceType:
          input.referenceType,

        referenceId:
          input.referenceId,

        description:
          input.description,

        metadata:
          input.metadata,

        occurredAt:
          input.occurredAt,

        lines: [
          {
            accountId:
              wallet.availableAccountId,

            side:
              LedgerEntrySide.DEBIT,

            amountNgn:
              input.amountNgn,

            memo:
              input.description,
          },
          {
            accountId:
              input.counterAccountId,

            side:
              LedgerEntrySide.CREDIT,

            amountNgn:
              input.amountNgn,

            memo:
              input.description,
          },
        ],
      },
    );
  }

  // ─────────────────────────────────────────────────────────
  // HOLDS
  // ─────────────────────────────────────────────────────────

  async createHold(input: CreateWalletHoldInput) {
    return this.prisma.$transaction(
      (tx) =>
        this.createHoldInTransaction(
          tx,
          input,
        ),
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /*
   * Transaction-aware hold creation.
   *
   * Phase 5 uses this inside the same transaction that:
   *
   * - validates the draw
   * - creates WalletPurchase
   * - creates tickets
   * - records jackpot accumulation
   * - captures the hold
   *
   * No nested transaction is started here.
   */
  async createHoldInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateWalletHoldInput,
  ) {
    this.validateAmount(input.amountNgn);

    const idempotencyKey =
      this.normalizeIdempotencyKey(
        input.idempotencyKey,
      );

    const wallet = await this.lockWallet(
      tx,
      input.walletId,
    );

    this.assertCanSpend(wallet.status);

    const existing =
      await tx.walletHold.findUnique({
        where: {
          idempotencyKey,
        },
      });

    if (existing) {
      if (
        existing.walletId !==
          input.walletId ||
        existing.amountNgn !==
          input.amountNgn ||
        existing.referenceType !==
          input.referenceType ||
        existing.referenceId !==
          input.referenceId
      ) {
        throw new ConflictException(
          'Wallet hold idempotency key was reused with different details',
        );
      }

      return existing;
    }

    const balances =
      await this.getBalancesInTx(
        tx,
        wallet,
      );

    if (
      balances.availableNgn <
      input.amountNgn
    ) {
      throw new ConflictException(
        'Insufficient wallet balance',
      );
    }

    /*
     * AVAILABLE -> HELD
     *
     * Both accounts are liabilities.
     *
     * Debit available reduces available liability.
     * Credit held increases held liability.
     */
    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `LEDGER:${idempotencyKey}`,

          kind:
            LedgerTransactionKind.WALLET_HOLD,

          referenceType:
            input.referenceType,

          referenceId:
            input.referenceId,

          description:
            input.description,

          metadata:
            input.metadata,

          occurredAt:
            input.occurredAt,

          lines: [
            {
              accountId:
                wallet.availableAccountId,

              side:
                LedgerEntrySide.DEBIT,

              amountNgn:
                input.amountNgn,

              memo:
                input.description,
            },
            {
              accountId:
                wallet.heldAccountId,

              side:
                LedgerEntrySide.CREDIT,

              amountNgn:
                input.amountNgn,

              memo:
                input.description,
            },
          ],
        },
      );

    return tx.walletHold.create({
      data: {
        walletId:
          input.walletId,

        idempotencyKey,

        referenceType:
          input.referenceType,

        referenceId:
          input.referenceId,

        amountNgn:
          input.amountNgn,

        status:
          WalletHoldStatus.HELD,

        holdLedgerTxnId:
          journal.ledgerTxnId,
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // RELEASE HOLD
  // ─────────────────────────────────────────────────────────

  async releaseHold(input: ResolveHoldInput) {
    const locator =
      await this.prisma.walletHold.findUnique({
        where: {
          holdId: input.holdId,
        },
        select: {
          walletId: true,
        },
      });

    if (!locator) {
      throw new NotFoundException(
        'Wallet hold not found',
      );
    }

    const idempotencyKey =
      this.normalizeIdempotencyKey(
        input.idempotencyKey,
      );

    await this.prisma.$transaction(
      async (tx) => {
        const wallet =
          await this.lockWallet(
            tx,
            locator.walletId,
          );

        this.assertNotClosed(
          wallet.status,
        );

        await tx.$queryRaw`
          SELECT hold_id
          FROM wallet_holds
          WHERE hold_id = ${input.holdId}
          FOR UPDATE
        `;

        const hold =
          await tx.walletHold.findUniqueOrThrow({
            where: {
              holdId:
                input.holdId,
            },
          });

        if (
          hold.status ===
          WalletHoldStatus.RELEASED
        ) {
          if (
            hold.releaseIdempotencyKey ===
            idempotencyKey
          ) {
            return;
          }

          throw new ConflictException(
            'Wallet hold has already been released',
          );
        }

        if (
          hold.status ===
          WalletHoldStatus.CAPTURED
        ) {
          throw new ConflictException(
            'Captured wallet hold cannot be released',
          );
        }

        const description =
          input.description ??
          'Release wallet hold';

        const journal =
          await this.ledger.postInTransaction(
            tx,
            {
              idempotencyKey,

              kind:
                LedgerTransactionKind.WALLET_RELEASE,

              referenceType:
                hold.referenceType,

              referenceId:
                hold.referenceId,

              description,

              metadata:
                input.metadata,

              lines: [
                {
                  accountId:
                    wallet.heldAccountId,

                  side:
                    LedgerEntrySide.DEBIT,

                  amountNgn:
                    hold.amountNgn,

                  memo:
                    input.description ??
                    'Release held funds',
                },
                {
                  accountId:
                    wallet.availableAccountId,

                  side:
                    LedgerEntrySide.CREDIT,

                  amountNgn:
                    hold.amountNgn,

                  memo:
                    input.description ??
                    'Return funds to available balance',
                },
              ],
            },
          );

        await tx.walletHold.update({
          where: {
            holdId:
              hold.holdId,
          },
          data: {
            status:
              WalletHoldStatus.RELEASED,

            releaseLedgerTxnId:
              journal.ledgerTxnId,

            releaseIdempotencyKey:
              idempotencyKey,

            resolvedAt:
              new Date(),
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return this.getHold(
      input.holdId,
    );
  }

  // ─────────────────────────────────────────────────────────
  // CAPTURE HOLD
  // ─────────────────────────────────────────────────────────

  async captureHold(
    input: CaptureWalletHoldInput,
  ) {
    await this.prisma.$transaction(
      (tx) =>
        this.captureHoldInTransaction(
          tx,
          input,
        ),
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return this.getHold(
      input.holdId,
    );
  }

  /*
   * Transaction-aware hold capture.
   *
   * Phase 5 calls this from the same transaction that
   * creates the WalletPurchase and the tickets.
   *
   * HELD -> external counter account
   *
   * For ticket purchases:
   *
   * Customer Held          DR
   * Ticket Sales Revenue   CR
   */
  async captureHoldInTransaction(
    tx: Prisma.TransactionClient,
    input: CaptureWalletHoldInput,
  ) {
    const idempotencyKey =
      this.normalizeIdempotencyKey(
        input.idempotencyKey,
      );

    /*
     * Find the wallet first so we know which wallet
     * row must be locked.
     */
    const probe =
      await tx.walletHold.findUnique({
        where: {
          holdId: input.holdId,
        },
        select: {
          walletId: true,
        },
      });

    if (!probe) {
      throw new NotFoundException(
        'Wallet hold not found',
      );
    }

    /*
     * Wallet lock serialises concurrent spending,
     * holds and captures for this wallet.
     */
    const wallet =
      await this.lockWallet(
        tx,
        probe.walletId,
      );

    this.assertCanSpend(
      wallet.status,
    );

    this.assertExternalCounterAccount(
      wallet,
      input.counterAccountId,
    );

    /*
     * Lock the hold lifecycle row independently.
     *
     * This prevents release/capture races.
     */
    await tx.$queryRaw`
      SELECT hold_id
      FROM wallet_holds
      WHERE hold_id = ${input.holdId}
      FOR UPDATE
    `;

    const hold =
      await tx.walletHold.findUniqueOrThrow({
        where: {
          holdId:
            input.holdId,
        },
      });

    /*
     * Exact replay is safe.
     */
    if (
      hold.status ===
      WalletHoldStatus.CAPTURED
    ) {
      if (
        hold.captureIdempotencyKey ===
        idempotencyKey
      ) {
        return hold;
      }

      throw new ConflictException(
        'Wallet hold has already been captured',
      );
    }

    /*
     * Once released back to available balance,
     * the same hold can never be captured.
     */
    if (
      hold.status ===
      WalletHoldStatus.RELEASED
    ) {
      throw new ConflictException(
        'Released wallet hold cannot be captured',
      );
    }

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `LEDGER:${idempotencyKey}`,

          kind:
            input.kind ??
            LedgerTransactionKind.WALLET_CAPTURE,

          referenceType:
            hold.referenceType,

          referenceId:
            hold.referenceId,

          description:
            input.description,

          metadata:
            input.metadata,

          occurredAt:
            input.occurredAt,

          lines: [
            {
              accountId:
                wallet.heldAccountId,

              side:
                LedgerEntrySide.DEBIT,

              amountNgn:
                hold.amountNgn,

              memo:
                input.description,
            },
            {
              accountId:
                input.counterAccountId,

              side:
                LedgerEntrySide.CREDIT,

              amountNgn:
                hold.amountNgn,

              memo:
                input.description,
            },
          ],
        },
      );

    return tx.walletHold.update({
      where: {
        holdId:
          hold.holdId,
      },
      data: {
        status:
          WalletHoldStatus.CAPTURED,

        captureLedgerTxnId:
          journal.ledgerTxnId,

        captureIdempotencyKey:
          idempotencyKey,

        resolvedAt:
          new Date(),
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // ADMIN WALLET STATE
  // ─────────────────────────────────────────────────────────

  async freezeWallet(
    walletId: string,
    adminId: string,
    reason: string,
  ) {
    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      throw new BadRequestException(
        'Freeze reason is required',
      );
    }

    const updated =
      await this.prisma.wallet.updateMany({
        where: {
          walletId,
          status:
            WalletStatus.ACTIVE,
        },
        data: {
          status:
            WalletStatus.FROZEN,
        },
      });

    if (updated.count !== 1) {
      const wallet =
        await this.prisma.wallet.findUnique({
          where: {
            walletId,
          },
        });

      if (!wallet) {
        throw new NotFoundException(
          'Wallet not found',
        );
      }

      throw new ConflictException(
        `Wallet is ${wallet.status}`,
      );
    }

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },

      action:
        'WALLET_FROZEN',

      resource: {
        type:
          'Wallet',
        id:
          walletId,
      },

      metadata: {
        reason:
          cleanReason,
      },
    });

    return this.getWallet(
      walletId,
    );
  }

  async unfreezeWallet(
    walletId: string,
    adminId: string,
    reason: string,
  ) {
    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      throw new BadRequestException(
        'Unfreeze reason is required',
      );
    }

    const updated =
      await this.prisma.wallet.updateMany({
        where: {
          walletId,
          status:
            WalletStatus.FROZEN,
        },
        data: {
          status:
            WalletStatus.ACTIVE,
        },
      });

    if (updated.count !== 1) {
      const wallet =
        await this.prisma.wallet.findUnique({
          where: {
            walletId,
          },
        });

      if (!wallet) {
        throw new NotFoundException(
          'Wallet not found',
        );
      }

      throw new ConflictException(
        `Wallet is ${wallet.status}`,
      );
    }

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },

      action:
        'WALLET_UNFROZEN',

      resource: {
        type:
          'Wallet',
        id:
          walletId,
      },

      metadata: {
        reason:
          cleanReason,
      },
    });

    return this.getWallet(
      walletId,
    );
  }

  async closeWallet(
    walletId: string,
    adminId: string,
    reason: string,
  ) {
    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      throw new BadRequestException(
        'Close reason is required',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const wallet =
          await this.lockWallet(
            tx,
            walletId,
          );

        if (
          wallet.status ===
          WalletStatus.CLOSED
        ) {
          throw new ConflictException(
            'Wallet is already closed',
          );
        }

        const balances =
          await this.getBalancesInTx(
            tx,
            wallet,
          );

        if (
          balances.availableNgn !==
            0 ||
          balances.heldNgn !==
            0
        ) {
          throw new ConflictException(
            'Wallet must have zero available and held balances before closing',
          );
        }

        const openHolds =
          await tx.walletHold.count({
            where: {
              walletId,
              status:
                WalletHoldStatus.HELD,
            },
          });

        if (openHolds > 0) {
          throw new ConflictException(
            'Wallet still has active holds',
          );
        }

        await tx.wallet.update({
          where: {
            walletId,
          },
          data: {
            status:
              WalletStatus.CLOSED,
          },
        });

        await tx.ledgerAccount.updateMany({
          where: {
            accountId: {
              in: [
                wallet.availableAccountId,
                wallet.heldAccountId,
              ],
            },
          },
          data: {
            status:
              LedgerAccountStatus.CLOSED,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },

      action:
        'WALLET_CLOSED',

      resource: {
        type:
          'Wallet',
        id:
          walletId,
      },

      metadata: {
        reason:
          cleanReason,
      },
    });

    return this.getWallet(
      walletId,
    );
  }

  // ─────────────────────────────────────────────────────────
  // WALLET PROVISIONING
  // ─────────────────────────────────────────────────────────

  private async ensureWallet(
    ownerType: LedgerOwnerType,
    ownerId: string,
  ) {
    if (
      ownerType !==
        LedgerOwnerType.CUSTOMER &&
      ownerType !==
        LedgerOwnerType.AGENT
    ) {
      throw new BadRequestException(
        'Wallet owner must be CUSTOMER or AGENT',
      );
    }

    const current =
      ownerType ===
      LedgerOwnerType.CUSTOMER
        ? await this.prisma.wallet.findUnique({
            where: {
              userId:
                ownerId,
            },
            include:
              WALLET_INCLUDE,
          })
        : await this.prisma.wallet.findUnique({
            where: {
              agentId:
                ownerId,
            },
            include:
              WALLET_INCLUDE,
          });

    if (current) {
      return this.toWalletView(
        current,
      );
    }

    try {
      const walletId =
        await this.prisma.$transaction(
          async (tx) => {
            if (
              ownerType ===
              LedgerOwnerType.CUSTOMER
            ) {
              const rows =
                await tx.$queryRaw<
                  Array<{
                    user_id: string;
                  }>
                >`
                  SELECT user_id
                  FROM users
                  WHERE user_id = ${ownerId}
                  FOR UPDATE
                `;

              if (
                rows.length === 0
              ) {
                throw new NotFoundException(
                  'Customer not found',
                );
              }

              const existing =
                await tx.wallet.findUnique({
                  where: {
                    userId:
                      ownerId,
                  },
                });

              if (existing) {
                return existing.walletId;
              }
            } else {
              const rows =
                await tx.$queryRaw<
                  Array<{
                    agent_id: string;
                  }>
                >`
                  SELECT agent_id
                  FROM agents
                  WHERE agent_id = ${ownerId}
                  FOR UPDATE
                `;

              if (
                rows.length === 0
              ) {
                throw new NotFoundException(
                  'Agent not found',
                );
              }

              const existing =
                await tx.wallet.findUnique({
                  where: {
                    agentId:
                      ownerId,
                  },
                });

              if (existing) {
                return existing.walletId;
              }
            }

            const ownerCode =
              ownerId.toUpperCase();

            const availablePurpose =
              ownerType ===
              LedgerOwnerType.CUSTOMER
                ? LedgerAccountPurpose.CUSTOMER_AVAILABLE
                : LedgerAccountPurpose.AGENT_AVAILABLE;

            const heldPurpose =
              ownerType ===
              LedgerOwnerType.CUSTOMER
                ? LedgerAccountPurpose.CUSTOMER_HELD
                : LedgerAccountPurpose.AGENT_HELD;

            const ownerName =
              ownerType ===
              LedgerOwnerType.CUSTOMER
                ? 'Customer'
                : 'Agent';

            const available =
              await tx.ledgerAccount.create({
                data: {
                  code:
                    `WALLET:${ownerType}:${ownerCode}:AVAILABLE`,

                  name:
                    `${ownerName} Available Balance`,

                  accountType:
                    LedgerAccountType.LIABILITY,

                  purpose:
                    availablePurpose,

                  ownerType,

                  ownerId,

                  currency:
                    'NGN',
                },
              });

            const held =
              await tx.ledgerAccount.create({
                data: {
                  code:
                    `WALLET:${ownerType}:${ownerCode}:HELD`,

                  name:
                    `${ownerName} Held Balance`,

                  accountType:
                    LedgerAccountType.LIABILITY,

                  purpose:
                    heldPurpose,

                  ownerType,

                  ownerId,

                  currency:
                    'NGN',
                },
              });

            const wallet =
              await tx.wallet.create({
                data: {
                  ownerType,

                  userId:
                    ownerType ===
                    LedgerOwnerType.CUSTOMER
                      ? ownerId
                      : null,

                  agentId:
                    ownerType ===
                    LedgerOwnerType.AGENT
                      ? ownerId
                      : null,

                  currency:
                    'NGN',

                  availableAccountId:
                    available.accountId,

                  heldAccountId:
                    held.accountId,
                },
              });

            return wallet.walletId;
          },
          {
            isolationLevel:
              Prisma.TransactionIsolationLevel.Serializable,
          },
        );

      return this.getWallet(
        walletId,
      );
    } catch (error) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          'P2002'
      ) {
        const raced =
          ownerType ===
          LedgerOwnerType.CUSTOMER
            ? await this.prisma.wallet.findUnique({
                where: {
                  userId:
                    ownerId,
                },
              })
            : await this.prisma.wallet.findUnique({
                where: {
                  agentId:
                    ownerId,
                },
              });

        if (raced) {
          return this.getWallet(
            raced.walletId,
          );
        }
      }

      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────

  private async getHold(
    holdId: string,
  ) {
    const hold =
      await this.prisma.walletHold.findUnique({
        where: {
          holdId,
        },
      });

    if (!hold) {
      throw new NotFoundException(
        'Wallet hold not found',
      );
    }

    return {
      holdId:
        hold.holdId,

      walletId:
        hold.walletId,

      referenceType:
        hold.referenceType,

      referenceId:
        hold.referenceId,

      amountNgn:
        hold.amountNgn,

      status:
        hold.status,

      holdLedgerTxnId:
        hold.holdLedgerTxnId,

      releaseLedgerTxnId:
        hold.releaseLedgerTxnId,

      captureLedgerTxnId:
        hold.captureLedgerTxnId,

      createdAt:
        hold.createdAt.toISOString(),

      resolvedAt:
        hold.resolvedAt?.toISOString() ??
        null,
    };
  }

  private async lockWallet(
    tx: Prisma.TransactionClient,
    walletId: string,
  ): Promise<WalletRecord> {
    const rows =
      await tx.$queryRaw<
        Array<{
          wallet_id: string;
        }>
      >`
        SELECT wallet_id
        FROM wallets
        WHERE wallet_id = ${walletId}
        FOR UPDATE
      `;

    if (
      rows.length === 0
    ) {
      throw new NotFoundException(
        'Wallet not found',
      );
    }

    return tx.wallet.findUniqueOrThrow({
      where: {
        walletId,
      },
      include:
        WALLET_INCLUDE,
    });
  }

  private async getBalancesInTx(
    tx: Prisma.TransactionClient,
    wallet: Pick<
      WalletRecord,
      | 'availableAccountId'
      | 'heldAccountId'
    >,
  ) {
    return this.getBalances(
      tx,
      wallet.availableAccountId,
      wallet.heldAccountId,
    );
  }

  private async getBalances(
    db: Pick<
      Prisma.TransactionClient,
      'ledgerEntry'
    >,
    availableAccountId: string,
    heldAccountId: string,
  ) {
    const rows =
      await db.ledgerEntry.groupBy({
        by: [
          'accountId',
          'side',
        ],
        where: {
          accountId: {
            in: [
              availableAccountId,
              heldAccountId,
            ],
          },
        },
        _sum: {
          amountNgn: true,
        },
      });

    let availableDebit = 0;
    let availableCredit = 0;
    let heldDebit = 0;
    let heldCredit = 0;

    for (const row of rows) {
      const amount =
        row._sum.amountNgn ??
        0;

      if (
        row.accountId ===
        availableAccountId
      ) {
        if (
          row.side ===
          LedgerEntrySide.DEBIT
        ) {
          availableDebit +=
            amount;
        } else {
          availableCredit +=
            amount;
        }
      }

      if (
        row.accountId ===
        heldAccountId
      ) {
        if (
          row.side ===
          LedgerEntrySide.DEBIT
        ) {
          heldDebit +=
            amount;
        } else {
          heldCredit +=
            amount;
        }
      }
    }

    return {
      availableNgn:
        availableCredit -
        availableDebit,

      heldNgn:
        heldCredit -
        heldDebit,

      totalNgn:
        availableCredit -
        availableDebit +
        heldCredit -
        heldDebit,
    };
  }

  private async toWalletView(
    wallet: WalletRecord,
  ) {
    const balances =
      await this.getBalances(
        this.prisma,
        wallet.availableAccountId,
        wallet.heldAccountId,
      );

    return {
      walletId:
        wallet.walletId,

      ownerType:
        wallet.ownerType,

      ownerId:
        wallet.userId ??
        wallet.agentId,

      currency:
        wallet.currency,

      status:
        wallet.status,

      availableNgn:
        balances.availableNgn,

      heldNgn:
        balances.heldNgn,

      totalNgn:
        balances.totalNgn,

      availableAccountId:
        wallet.availableAccountId,

      heldAccountId:
        wallet.heldAccountId,

      createdAt:
        wallet.createdAt.toISOString(),

      updatedAt:
        wallet.updatedAt.toISOString(),
    };
  }

  private validateAmount(
    amountNgn: number,
  ) {
    if (
      !Number.isSafeInteger(
        amountNgn,
      ) ||
      amountNgn <= 0
    ) {
      throw new BadRequestException(
        'Wallet amount must be a positive whole naira value',
      );
    }
  }

  private normalizeIdempotencyKey(
    value: string,
  ) {
    const key =
      value.trim();

    if (!key) {
      throw new BadRequestException(
        'Idempotency key is required',
      );
    }

    if (
      key.length >
      200
    ) {
      throw new BadRequestException(
        'Idempotency key is too long',
      );
    }

    return key;
  }

  private assertCanReceive(
    status: WalletStatus,
  ) {
    /*
     * FROZEN wallets may still receive money.
     *
     * CLOSED wallets may not.
     */
    if (
      status ===
      WalletStatus.CLOSED
    ) {
      throw new ConflictException(
        'Wallet is closed',
      );
    }
  }

  private assertCanSpend(
    status: WalletStatus,
  ) {
    if (
      status !==
      WalletStatus.ACTIVE
    ) {
      throw new ConflictException(
        `Wallet is ${status}`,
      );
    }
  }

  private assertNotClosed(
    status: WalletStatus,
  ) {
    if (
      status ===
      WalletStatus.CLOSED
    ) {
      throw new ConflictException(
        'Wallet is closed',
      );
    }
  }

  private assertExternalCounterAccount(
    wallet: Pick<
      WalletRecord,
      | 'availableAccountId'
      | 'heldAccountId'
    >,
    counterAccountId: string,
  ) {
    if (
      counterAccountId ===
        wallet.availableAccountId ||
      counterAccountId ===
        wallet.heldAccountId
    ) {
      throw new BadRequestException(
        'Counter account cannot be one of the wallet accounts',
      );
    }
  }
}