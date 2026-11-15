import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  CbaBalanceMigrationStatus,
  LedgerOwnerType,
  LedgerTransactionKind,
  Prisma,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../integrations/witmango/witmango-client.service';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';

// Which CBA account a legacy balance may go to. Finance chooses: an old
// ledger balance may be deposited money or winnings, and only finance can
// tell which from its history.
const ALLOWED_PURPOSES: Record<string, WitmangoWalletPurpose[]> = {
  [LedgerOwnerType.CUSTOMER]: [WitmangoWalletPurpose.DEPOSIT, WitmangoWalletPurpose.WINNINGS],
  [LedgerOwnerType.AGENT]: [WitmangoWalletPurpose.FLOAT, WitmangoWalletPurpose.EARNINGS],
};

const WAT_OFFSET_MS = 60 * 60 * 1000;

// Moves a wallet's remaining SureWina-ledger balance onto the CBA, once.
//
//   1. In one transaction: the ledger wallet is debited in full (against
//      bank cash) and this record written. From here the ledger balance
//      cannot also be spent.
//   2. The CBA deposit is made under a receipt number written down first.
//   3. Refused: the ledger debit is put back. Uncertain: looked up by its
//      receipt; never deposited again on a guess.
//
// The money itself must also be moved into the Monnify vault by finance;
// the daily reconciliation shows a shortfall until it is.
@Injectable()
export class CbaBalanceMigrationService {
  private readonly logger = new Logger(CbaBalanceMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallets: WalletService,
    private readonly witmango: WitmangoClientService,
    private readonly links: WitmangoWalletLinkService,
  ) {}

  async preview(walletId: string) {
    const [wallet, existing, state] = await Promise.all([
      this.wallets.getWallet(walletId),
      this.prisma.cbaBalanceMigration.findUnique({ where: { walletId } }),
      this.links.getState(walletId),
    ]);

    return {
      walletId,
      ownerType: wallet.ownerType,
      cbaState: state,
      ledgerAvailableNgn: wallet.availableNgn,
      ledgerHeldNgn: wallet.heldNgn,
      allowedPurposes: ALLOWED_PURPOSES[wallet.ownerType] ?? [],
      migration: existing ? this.toView(existing) : null,
    };
  }

  async migrate(walletId: string, purpose: WitmangoWalletPurpose, adminId: string) {
    const existing = await this.prisma.cbaBalanceMigration.findUnique({ where: { walletId } });

    if (existing) {
      // Once per wallet. An unfinished one is moved on, never repeated.
      if (existing.status === CbaBalanceMigrationStatus.REVIEW_REQUIRED) {
        await this.resolveByLookup(existing.migrationId);
      }

      return this.toView(
        await this.prisma.cbaBalanceMigration.findUniqueOrThrow({ where: { walletId } }),
      );
    }

    const wallet = await this.wallets.getWallet(walletId);

    if (!(ALLOWED_PURPOSES[wallet.ownerType] ?? []).includes(purpose)) {
      throw new BadRequestException(
        `A ${wallet.ownerType.toLowerCase()} balance cannot go to ${purpose}`,
      );
    }

    if ((await this.links.getState(walletId)) !== 'READY') {
      throw new ConflictException('The wallet’s CBA accounts are not ready');
    }

    if (wallet.heldNgn > 0) {
      throw new ConflictException(
        'This wallet has ledger holds in progress. Wait for them to finish before moving its balance.',
      );
    }

    const amountNgn = wallet.availableNgn;

    if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
      throw new ConflictException('There is no ledger balance to move');
    }

    const account = await this.links.getActiveAccount(walletId, purpose);
    const cbaReference = `sw-mig-${walletId}`;

    let migration;

    try {
      migration = await this.prisma.$transaction(
        async (tx) => {
          const bankCash = await tx.ledgerAccount.findUnique({
            where: { code: SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH },
          });

          if (!bankCash) {
            throw new ServiceUnavailableException('Bank cash ledger account is missing');
          }

          const created = await tx.cbaBalanceMigration.create({
            data: {
              walletId,
              amountNgn,
              purpose,
              savingsAccountId: account.savingsAccountId,
              cbaReference,
              createdBy: adminId,
            },
          });

          const journal = await this.wallets.debitInTransaction(tx, {
            walletId,
            amountNgn,
            counterAccountId: bankCash.accountId,
            idempotencyKey: `ledger:cba-migration:${created.migrationId}`,
            kind: LedgerTransactionKind.TRANSFER,
            referenceType: 'CbaBalanceMigration',
            referenceId: created.migrationId,
            description: 'Wallet balance moved to the CBA',
            metadata: { purpose, savingsAccountId: account.savingsAccountId },
          });

          return tx.cbaBalanceMigration.update({
            where: { migrationId: created.migrationId },
            data: { ledgerTxnId: journal.ledgerTxnId },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.toView(
          await this.prisma.cbaBalanceMigration.findUniqueOrThrow({ where: { walletId } }),
        );
      }

      throw error;
    }

    await this.writeAudit(adminId, migration.migrationId, 'CBA_BALANCE_MIGRATION_STARTED', {
      walletId,
      amountNgn,
      purpose,
    });

    try {
      const posted = await this.witmango.deposit({
        accountId: account.savingsAccountId,
        amountNgn,
        transactionDate: this.today(),
        reference: cbaReference,
      });

      await this.prisma.cbaBalanceMigration.update({
        where: { migrationId: migration.migrationId },
        data: {
          status: CbaBalanceMigrationStatus.CREDITED,
          cbaTransactionId: posted.transactionId,
          creditedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof WitmangoUncertainOutcomeError) {
        await this.prisma.cbaBalanceMigration.update({
          where: { migrationId: migration.migrationId },
          data: { status: CbaBalanceMigrationStatus.REVIEW_REQUIRED, failureReason: 'CBA_OUTCOME_UNCERTAIN' },
        });

        await this.resolveByLookup(migration.migrationId);
      } else {
        // Nothing reached the CBA. Put the ledger balance back.
        await this.putBack(migration.migrationId, adminId, this.message(error));
      }
    }

    return this.toView(
      await this.prisma.cbaBalanceMigration.findUniqueOrThrow({
        where: { migrationId: migration.migrationId },
      }),
    );
  }

  private async resolveByLookup(migrationId: string): Promise<void> {
    const migration = await this.prisma.cbaBalanceMigration.findUniqueOrThrow({ where: { migrationId } });

    let found;

    try {
      found = await this.witmango.findTransactionByReference(
        migration.savingsAccountId,
        migration.cbaReference,
      );
    } catch {
      found = undefined;
    }

    if (
      found &&
      found.kind === 'DEPOSIT' &&
      !found.reversed &&
      found.amountNgn === migration.amountNgn
    ) {
      await this.prisma.cbaBalanceMigration.update({
        where: { migrationId },
        data: {
          status: CbaBalanceMigrationStatus.CREDITED,
          cbaTransactionId: found.transactionId,
          creditedAt: new Date(),
          failureReason: null,
        },
      });
    }

    // Not found is not proof it never landed: it stays for a person.
  }

  private async putBack(migrationId: string, adminId: string, reason: string): Promise<void> {
    const migration = await this.prisma.cbaBalanceMigration.findUniqueOrThrow({ where: { migrationId } });

    try {
      const bankCash = await this.prisma.ledgerAccount.findUniqueOrThrow({
        where: { code: SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH },
      });

      const { journal } = await this.wallets.credit({
        walletId: migration.walletId,
        amountNgn: migration.amountNgn,
        counterAccountId: bankCash.accountId,
        idempotencyKey: `ledger:cba-migration-reversal:${migrationId}`,
        kind: LedgerTransactionKind.REVERSAL,
        referenceType: 'CbaBalanceMigration',
        referenceId: migrationId,
        description: 'CBA refused the balance move; ledger balance restored',
      });

      await this.prisma.cbaBalanceMigration.update({
        where: { migrationId },
        data: {
          status: CbaBalanceMigrationStatus.FAILED,
          failureReason: 'CBA_REJECTED',
          reversalLedgerTxnId: journal.ledgerTxnId,
        },
      });

      await this.writeAudit(adminId, migrationId, 'CBA_BALANCE_MIGRATION_FAILED', { reason });
    } catch (error) {
      this.logger.error(`Could not restore ledger for migration ${migrationId}: ${this.message(error)}`);

      await this.prisma.cbaBalanceMigration.update({
        where: { migrationId },
        data: { status: CbaBalanceMigrationStatus.REVIEW_REQUIRED, failureReason: 'LEDGER_RESTORE_FAILED' },
      });
    }
  }

  private toView(row: {
    migrationId: string;
    walletId: string;
    amountNgn: number;
    purpose: WitmangoWalletPurpose;
    status: CbaBalanceMigrationStatus;
    failureReason: string | null;
    creditedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      migrationId: row.migrationId,
      walletId: row.walletId,
      amountNgn: row.amountNgn,
      purpose: row.purpose,
      status: row.status,
      failureReason: row.failureReason,
      creditedAt: row.creditedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private today(): string {
    return new Date(Date.now() + WAT_OFFSET_MS).toISOString().slice(0, 10);
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }

  private async writeAudit(adminId: string, migrationId: string, action: string, metadata: Record<string, unknown>) {
    await this.audit
      .write({
        severity: AuditSeverity.CRITICAL,
        actor: { type: AuditActorType.ADMIN, id: adminId },
        action,
        resource: { type: 'CbaBalanceMigration', id: migrationId },
        metadata,
      })
      .catch(() => undefined);
  }
}
