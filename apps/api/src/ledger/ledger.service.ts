import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  LedgerAccountPurpose,
  LedgerAccountStatus,
  LedgerAccountType,
  LedgerEntrySide,
  LedgerOwnerType,
  LedgerTransactionKind,
  Prisma,
} from '@prisma/client';

import {
  createHash,
} from 'crypto';

import { PrismaService } from '../database/prisma.service';

import {
  calculateLedgerTotals,
  canonicalJson,
  naturalLedgerBalance,
} from './ledger.utils';

const LEDGER_TRANSACTION_INCLUDE = {
  entries: {
    orderBy: {
      lineNo:
        'asc' as const,
    },

    include: {
      account:
        true,
    },
  },

  reverses:
    true,

  reversedBy:
    true,
} satisfies Prisma.LedgerTransactionInclude;

export type LedgerTransactionView =
  Prisma.LedgerTransactionGetPayload<{
    include:
      typeof LEDGER_TRANSACTION_INCLUDE;
  }>;

export type EnsureLedgerAccountInput = {
  code: string;

  name: string;

  accountType:
    LedgerAccountType;

  purpose:
    LedgerAccountPurpose;

  ownerType:
    LedgerOwnerType;

  ownerId?:
    string | null;

  currency?:
    string;
};

export type LedgerLineInput = {
  accountId: string;

  side:
    LedgerEntrySide;

  amountNgn:
    number;

  memo?:
    string;
};

export type PostLedgerTransactionInput = {
  idempotencyKey:
    string;

  kind:
    LedgerTransactionKind;

  referenceType:
    string;

  referenceId:
    string;

  description?:
    string;

  occurredAt?:
    Date;

  metadata?:
    Prisma.InputJsonValue;

  lines:
    LedgerLineInput[];
};

export type ReverseLedgerTransactionInput = {
  originalLedgerTxnId:
    string;

  idempotencyKey:
    string;

  referenceType:
    string;

  referenceId:
    string;

  description?:
    string;

  metadata?:
    Prisma.InputJsonValue;
};

type InternalPostOptions = {
  reversesLedgerTxnId?:
    string;
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  /*
   * Deterministically create or retrieve an account.
   *
   * Existing account identity must match exactly.
   */
  async ensureAccount(
    input:
      EnsureLedgerAccountInput,
  ) {
    const normalized =
      this.normalizeAccountInput(
        input,
      );

    const existing =
      await this.prisma.ledgerAccount.findUnique({
        where: {
          code:
            normalized.code,
        },
      });

    if (existing) {
      this.assertSameAccountIdentity(
        existing,
        normalized,
      );

      return existing;
    }

    try {
      return await this.prisma.ledgerAccount.create({
        data:
          normalized,
      });
    } catch (error) {
      /*
       * Multiple application instances may bootstrap the
       * same deterministic system account concurrently.
       */
      if (
        this.isUniqueViolation(
          error,
        )
      ) {
        const raced =
          await this.prisma.ledgerAccount.findUnique({
            where: {
              code:
                normalized.code,
            },
          });

        if (raced) {
          this.assertSameAccountIdentity(
            raced,
            normalized,
          );

          return raced;
        }
      }

      throw error;
    }
  }

  async post(
    input:
      PostLedgerTransactionInput,
  ): Promise<LedgerTransactionView> {
    try {
      return await this.prisma.$transaction(
        async (tx) =>
          this.postInTransaction(
            tx,
            input,
          ),

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      /*
       * Concurrent delivery of the same idempotent
       * financial event may race on the unique key.
       *
       * Recover by returning the already-posted journal
       * only when its fingerprint is identical.
       */
      if (
        this.isUniqueViolation(
          error,
        )
      ) {
        const existing =
          await this.prisma.ledgerTransaction.findUnique({
            where: {
              idempotencyKey:
                input.idempotencyKey.trim(),
            },
          });

        if (existing) {
          const prepared =
            await this.prepare(
              this.prisma,
              input,
            );

          if (
            existing.fingerprint !==
            prepared.fingerprint
          ) {
            throw new ConflictException(
              'Ledger idempotency key already exists with different financial data',
            );
          }

          return this.getTransaction(
            existing.ledgerTxnId,
          );
        }
      }

      throw error;
    }
  }

  /*
   * Use this when a future wallet/business operation
   * already has an open Prisma transaction.
   *
   * This lets the business mutation and its ledger
   * journal commit atomically.
   */
  async postInTransaction(
    tx:
      Prisma.TransactionClient,

    input:
      PostLedgerTransactionInput,
  ): Promise<LedgerTransactionView> {
    return this.postInternal(
      tx,
      input,
      {},
    );
  }

  /*
   * Reversal is the only supported correction mechanism.
   *
   * The original journal remains untouched forever.
   */
  async reverse(
    input:
      ReverseLedgerTransactionInput,
  ): Promise<LedgerTransactionView> {
    return this.prisma.$transaction(
      async (tx) => {
        const original =
          await tx.ledgerTransaction.findUnique({
            where: {
              ledgerTxnId:
                input.originalLedgerTxnId,
            },

            include:
              LEDGER_TRANSACTION_INCLUDE,
          });

        if (!original) {
          throw new NotFoundException(
            'Original ledger transaction not found',
          );
        }

        const alreadyReversed =
          await tx.ledgerTransaction.findUnique({
            where: {
              reversesLedgerTxnId:
                original.ledgerTxnId,
            },

            include:
              LEDGER_TRANSACTION_INCLUDE,
          });

        if (
          alreadyReversed
        ) {
          if (
            alreadyReversed.idempotencyKey ===
            input.idempotencyKey.trim()
          ) {
            return alreadyReversed;
          }

          throw new ConflictException(
            'Ledger transaction has already been reversed',
          );
        }

        const lines:
          LedgerLineInput[] =
            original.entries.map(
              (entry) => ({
                accountId:
                  entry.accountId,

                side:
                  entry.side ===
                  LedgerEntrySide.DEBIT
                    ? LedgerEntrySide.CREDIT
                    : LedgerEntrySide.DEBIT,

                amountNgn:
                  entry.amountNgn,

                memo:
                  `Reversal of ${original.ledgerTxnId}`,
              }),
            );

        return this.postInternal(
          tx,
          {
            idempotencyKey:
              input.idempotencyKey,

            kind:
              LedgerTransactionKind.REVERSAL,

            referenceType:
              input.referenceType,

            referenceId:
              input.referenceId,

            description:
              input.description ??
              `Reversal of ${original.ledgerTxnId}`,

            metadata:
              input.metadata,

            lines,
          },

          {
            reversesLedgerTxnId:
              original.ledgerTxnId,
          },
        );
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async getTransaction(
    ledgerTxnId:
      string,
  ): Promise<LedgerTransactionView> {
    const transaction =
      await this.prisma.ledgerTransaction.findUnique({
        where: {
          ledgerTxnId,
        },

        include:
          LEDGER_TRANSACTION_INCLUDE,
      });

    if (!transaction) {
      throw new NotFoundException(
        'Ledger transaction not found',
      );
    }

    return transaction;
  }

  async getAccountBalance(
    accountId:
      string,
  ) {
    const account =
      await this.prisma.ledgerAccount.findUnique({
        where: {
          accountId,
        },
      });

    if (!account) {
      throw new NotFoundException(
        'Ledger account not found',
      );
    }

    const grouped =
      await this.prisma.ledgerEntry.groupBy({
        by: [
          'side',
        ],

        where: {
          accountId,
        },

        _sum: {
          amountNgn:
            true,
        },
      });

    let debitNgn =
      0;

    let creditNgn =
      0;

    for (
      const row of
      grouped
    ) {
      const amount =
        row._sum.amountNgn ??
        0;

      if (
        row.side ===
        LedgerEntrySide.DEBIT
      ) {
        debitNgn =
          amount;
      } else {
        creditNgn =
          amount;
      }
    }

    return {
      accountId:
        account.accountId,

      code:
        account.code,

      name:
        account.name,

      accountType:
        account.accountType,

      purpose:
        account.purpose,

      ownerType:
        account.ownerType,

      ownerId:
        account.ownerId,

      currency:
        account.currency,

      status:
        account.status,

      debitNgn,

      creditNgn,

      balanceNgn:
        naturalLedgerBalance(
          account.accountType,
          debitNgn,
          creditNgn,
        ),
    };
  }

  async trialBalance() {
    const accounts =
      await this.prisma.ledgerAccount.findMany({
        orderBy: {
          code:
            'asc',
        },
      });

    const grouped =
      await this.prisma.ledgerEntry.groupBy({
        by: [
          'accountId',
          'side',
        ],

        _sum: {
          amountNgn:
            true,
        },
      });

    const balances =
      new Map<
        string,
        {
          debitNgn: number;
          creditNgn: number;
        }
      >();

    let totalDebitNgn =
      0;

    let totalCreditNgn =
      0;

    for (
      const row of
      grouped
    ) {
      const amount =
        row._sum.amountNgn ??
        0;

      const balance =
        balances.get(
          row.accountId,
        ) ?? {
          debitNgn:
            0,

          creditNgn:
            0,
        };

      if (
        row.side ===
        LedgerEntrySide.DEBIT
      ) {
        balance.debitNgn +=
          amount;

        totalDebitNgn +=
          amount;
      } else {
        balance.creditNgn +=
          amount;

        totalCreditNgn +=
          amount;
      }

      balances.set(
        row.accountId,
        balance,
      );
    }

    return {
      currency:
        'NGN',

      totalDebitNgn,

      totalCreditNgn,

      balanced:
        totalDebitNgn ===
        totalCreditNgn,

      accounts:
        accounts.map(
          (account) => {
            const totals =
              balances.get(
                account.accountId,
              ) ?? {
                debitNgn:
                  0,

                creditNgn:
                  0,
              };

            return {
              accountId:
                account.accountId,

              code:
                account.code,

              name:
                account.name,

              accountType:
                account.accountType,

              purpose:
                account.purpose,

              ownerType:
                account.ownerType,

              ownerId:
                account.ownerId,

              status:
                account.status,

              currency:
                account.currency,

              debitNgn:
                totals.debitNgn,

              creditNgn:
                totals.creditNgn,

              balanceNgn:
                naturalLedgerBalance(
                  account.accountType,
                  totals.debitNgn,
                  totals.creditNgn,
                ),
            };
          },
        ),
    };
  }

  private async postInternal(
    tx:
      Prisma.TransactionClient,

    input:
      PostLedgerTransactionInput,

    options:
      InternalPostOptions,
  ): Promise<LedgerTransactionView> {
    const prepared =
      await this.prepare(
        tx,
        input,
        options,
      );

    const existing =
      await tx.ledgerTransaction.findUnique({
        where: {
          idempotencyKey:
            prepared.idempotencyKey,
        },
      });

    if (existing) {
      if (
        existing.fingerprint !==
        prepared.fingerprint
      ) {
        throw new ConflictException(
          'Ledger idempotency key already exists with different financial data',
        );
      }

      const existingFull =
        await tx.ledgerTransaction.findUniqueOrThrow({
          where: {
            ledgerTxnId:
              existing.ledgerTxnId,
          },

          include:
            LEDGER_TRANSACTION_INCLUDE,
        });

      return existingFull;
    }

    const transaction =
      await tx.ledgerTransaction.create({
        data: {
          idempotencyKey:
            prepared.idempotencyKey,

          kind:
            input.kind,

          referenceType:
            prepared.referenceType,

          referenceId:
            prepared.referenceId,

          description:
            prepared.description,

          currency:
            prepared.currency,

          totalAmountNgn:
            prepared.totalDebitNgn,

          entryCount:
            prepared.lines.length,

          fingerprint:
            prepared.fingerprint,

          metadata:
            input.metadata,

          occurredAt:
            input.occurredAt ??
            new Date(),

          reversesLedgerTxnId:
            options.reversesLedgerTxnId ??
            null,
        },
      });

    await tx.ledgerEntry.createMany({
      data:
        prepared.lines.map(
          (
            line,
            index,
          ) => ({
            ledgerTxnId:
              transaction.ledgerTxnId,

            accountId:
              line.accountId,

            lineNo:
              index + 1,

            side:
              line.side,

            amountNgn:
              line.amountNgn,

            memo:
              line.memo,
          }),
        ),
    });

    return tx.ledgerTransaction.findUniqueOrThrow({
      where: {
        ledgerTxnId:
          transaction.ledgerTxnId,
      },

      include:
        LEDGER_TRANSACTION_INCLUDE,
    });
  }

  private async prepare(
    db:
      Pick<
        Prisma.TransactionClient,
        | 'ledgerAccount'
        | 'ledgerTransaction'
      >,

    input:
      PostLedgerTransactionInput,

    options:
      InternalPostOptions =
        {},
  ) {
    const idempotencyKey =
      input.idempotencyKey.trim();

    const referenceType =
      input.referenceType.trim();

    const referenceId =
      input.referenceId.trim();

    const description =
      input.description?.trim() ||
      null;

    if (
      !idempotencyKey
    ) {
      throw new BadRequestException(
        'Ledger idempotency key is required',
      );
    }

    if (
      idempotencyKey.length >
      200
    ) {
      throw new BadRequestException(
        'Ledger idempotency key is too long',
      );
    }

    if (
      !referenceType ||
      !referenceId
    ) {
      throw new BadRequestException(
        'Ledger referenceType and referenceId are required',
      );
    }

    if (
      input.lines.length <
      2
    ) {
      throw new BadRequestException(
        'A ledger transaction requires at least two entries',
      );
    }

    const seenAccounts =
      new Set<string>();

    const lines =
      input.lines.map(
        (line) => {
          const accountId =
            line.accountId.trim();

          if (
            !accountId
          ) {
            throw new BadRequestException(
              'Ledger accountId is required',
            );
          }

          if (
            seenAccounts.has(
              accountId,
            )
          ) {
            throw new BadRequestException(
              `Ledger account ${accountId} appears more than once in the same transaction`,
            );
          }

          seenAccounts.add(
            accountId,
          );

          if (
            !Number.isSafeInteger(
              line.amountNgn,
            ) ||
            line.amountNgn <=
              0
          ) {
            throw new BadRequestException(
              'Ledger amounts must be positive whole naira values',
            );
          }

          return {
            accountId,

            side:
              line.side,

            amountNgn:
              line.amountNgn,

            memo:
              line.memo
                ?.trim()
                .slice(
                  0,
                  300,
                ) ||
              null,
          };
        },
      );

    /*
     * Canonical ordering means callers can provide the
     * same journal lines in a different order and still
     * get the same idempotency fingerprint.
     */
    lines.sort(
      (
        a,
        b,
      ) =>
        `${a.accountId}:${a.side}`.localeCompare(
          `${b.accountId}:${b.side}`,
        ),
    );

    const totals =
      calculateLedgerTotals(
        lines,
      );

    if (
      !totals.balanced
    ) {
      throw new BadRequestException(
        `Ledger transaction is not balanced: debit=${totals.debitNgn}, credit=${totals.creditNgn}`,
      );
    }

    if (
      totals.debitNgn <=
      0
    ) {
      throw new BadRequestException(
        'Ledger transaction total must be greater than zero',
      );
    }

    const accountIds =
      lines.map(
        (line) =>
          line.accountId,
      );

    const accounts =
      await db.ledgerAccount.findMany({
        where: {
          accountId: {
            in:
              accountIds,
          },
        },
      });

    if (
      accounts.length !==
      accountIds.length
    ) {
      const found =
        new Set(
          accounts.map(
            (account) =>
              account.accountId,
          ),
        );

      const missing =
        accountIds.filter(
          (accountId) =>
            !found.has(
              accountId,
            ),
        );

      throw new NotFoundException(
        `Ledger account(s) not found: ${missing.join(', ')}`,
      );
    }

    for (
      const account of
      accounts
    ) {
      if (
        account.status !==
        LedgerAccountStatus.ACTIVE
      ) {
        throw new ConflictException(
          `Ledger account ${account.code} is ${account.status}`,
        );
      }
    }

    const currencies =
      new Set(
        accounts.map(
          (account) =>
            account.currency,
        ),
      );

    if (
      currencies.size !==
      1
    ) {
      throw new BadRequestException(
        'Cross-currency ledger transactions are not supported',
      );
    }

    const currency =
      accounts[0].currency;

    if (
      currency !==
      'NGN'
    ) {
      throw new BadRequestException(
        `Unsupported ledger currency ${currency}`,
      );
    }

    const fingerprint =
      createHash(
        'sha256',
      )
        .update(
          canonicalJson({
            kind:
              input.kind,

            referenceType,

            referenceId,

            description,

            currency,

            explicitOccurredAt:
              input.occurredAt
                ?.toISOString() ??
              null,

            reversesLedgerTxnId:
              options.reversesLedgerTxnId ??
              null,

            metadata:
              input.metadata ??
              null,

            lines,
          }),
        )
        .digest(
          'hex',
        );

    return {
      idempotencyKey,
      referenceType,
      referenceId,
      description,
      currency,
      lines,
      totalDebitNgn:
        totals.debitNgn,
      fingerprint,
    };
  }

  private normalizeAccountInput(
    input:
      EnsureLedgerAccountInput,
  ) {
    const code =
      input.code
        .trim()
        .toUpperCase();

    const name =
      input.name.trim();

    const currency =
      (
        input.currency ??
        'NGN'
      )
        .trim()
        .toUpperCase();

    if (
      !code ||
      !name
    ) {
      throw new BadRequestException(
        'Ledger account code and name are required',
      );
    }

    if (
      currency.length !==
      3
    ) {
      throw new BadRequestException(
        'Ledger currency must be a 3-letter currency code',
      );
    }

    return {
      code,
      name,

      accountType:
        input.accountType,

      purpose:
        input.purpose,

      ownerType:
        input.ownerType,

      ownerId:
        input.ownerId ??
        null,

      currency,
    };
  }

  private assertSameAccountIdentity(
    existing: {
      code: string;
      accountType:
        LedgerAccountType;
      purpose:
        LedgerAccountPurpose;
      ownerType:
        LedgerOwnerType;
      ownerId:
        string | null;
      currency:
        string;
    },

    expected:
      ReturnType<
        LedgerService['normalizeAccountInput']
      >,
  ) {
    if (
      existing.code !==
        expected.code ||
      existing.accountType !==
        expected.accountType ||
      existing.purpose !==
        expected.purpose ||
      existing.ownerType !==
        expected.ownerType ||
      existing.ownerId !==
        expected.ownerId ||
      existing.currency !==
        expected.currency
    ) {
      throw new ConflictException(
        `Ledger account ${expected.code} already exists with different identity`,
      );
    }
  }

  private isUniqueViolation(
    error:
      unknown,
  ) {
    return (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        'P2002'
    );
  }
}