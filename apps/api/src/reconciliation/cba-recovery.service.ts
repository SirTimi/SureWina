import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CbaTransferStatus,
  CbaWithdrawalStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CBA_TRANSFER_REASON,
  OWED_PURPOSES,
  WitmangoTransferService,
} from '../integrations/witmango/witmango-transfer.service';
import { CbaWithdrawalService } from '../withdrawals/cba-withdrawal.service';

import { CbaReconciliationService } from './cba-reconciliation.service';

const SWEEP_MS = 5 * 60_000;
const SCHEDULE_CHECK_MS = 15 * 60_000;

// A record younger than this may still be in the hands of the request that
// created it; the sweep leaves it alone.
const SETTLE_AFTER_MS = 2 * 60_000;

const BATCH_SIZE = 50;

// Withdrawals the sweep moves on. Each step it takes is the same one a
// person would take with "refresh": query Monnify, settle, or pay a locked
// withdrawal whose request stopped before paying.
const SWEEPABLE_WITHDRAWALS: CbaWithdrawalStatus[] = [
  CbaWithdrawalStatus.LOCKED,
  CbaWithdrawalStatus.PAYOUT_PENDING,
  CbaWithdrawalStatus.PAID,
];

// Background work for CBA wallets, each part behind its own switch:
//
//   - the daily reconciliation, at the configured WAT hour;
//   - the retry sweep, every five minutes.
//
// Only one API instance acts at a time: each run takes a Redis lock first.
// The sweep only ever repeats what is proven safe to repeat. Anything with
// an unknown outcome is left for a person, exactly as before.
@Injectable()
export class CbaRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CbaRecoveryService.name);

  private sweepTimer?: NodeJS.Timeout;
  private scheduleTimer?: NodeJS.Timeout;
  private sweeping = false;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly transfers: WitmangoTransferService,
    private readonly withdrawals: CbaWithdrawalService,
    private readonly reconciliation: CbaReconciliationService,
  ) {}

  onModuleInit() {
    if (this.config.get<boolean>('CBA_RECOVERY_SWEEP_ENABLED') === true) {
      this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_MS);
      this.logger.log('CBA retry sweep started (every 5m)');
    }

    if (this.config.get<boolean>('CBA_RECONCILIATION_ENABLED') === true) {
      this.scheduleTimer = setInterval(
        () => void this.maybeReconcile(),
        SCHEDULE_CHECK_MS,
      );
      this.logger.log('CBA daily reconciliation scheduled');
    }
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
  }

  // Runs today's reconciliation once the configured hour has passed, if it
  // has not run yet.
  async maybeReconcile(now = Date.now()): Promise<boolean> {
    if (this.reconciling) return false;

    const hour = Number(this.config.get('CBA_RECONCILIATION_HOUR_WAT') ?? 6);
    const watHour = new Date(now + 60 * 60 * 1000).getUTCHours();

    if (watHour < hour) return false;
    if (await this.reconciliation.hasScheduledRunToday()) return false;

    const day = this.reconciliation.watDate(now);

    if (!(await this.lock(`surewina:cba-reconciliation:${day}`, 60 * 60))) {
      return false;
    }

    this.reconciling = true;

    try {
      await this.reconciliation.run('schedule');
      return true;
    } catch (error) {
      this.logger.error(`CBA reconciliation failed: ${this.message(error)}`);
      return false;
    } finally {
      this.reconciling = false;
    }
  }

  async sweep(): Promise<{ withdrawals: number; transfers: number }> {
    if (this.sweeping) return { withdrawals: 0, transfers: 0 };
    if (!(await this.lock('surewina:cba-recovery-sweep', 4 * 60))) {
      return { withdrawals: 0, transfers: 0 };
    }

    this.sweeping = true;

    try {
      const settled = new Date(Date.now() - SETTLE_AFTER_MS);

      // 1. Withdrawals waiting on Monnify or the CBA.
      const waiting = await this.prisma.cbaWithdrawal.findMany({
        where: {
          status: { in: SWEEPABLE_WITHDRAWALS },
          updatedAt: { lt: settled },
        },
        select: { withdrawalId: true },
        orderBy: { updatedAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const { withdrawalId } of waiting) {
        try {
          await this.withdrawals.refresh(withdrawalId);
        } catch (error) {
          this.logger.warn(`Withdrawal ${withdrawalId} not moved on: ${this.message(error)}`);
        }
      }

      // 2. Owed commission and prize reimbursements.
      //    - PENDING and never claimed: written down but never sent (the
      //      server stopped first). Sending is safe — execute() claims it.
      //    - FAILED because the CBA was switched off or not configured:
      //      nothing was sent. Retried automatically.
      //    A refusal by the CBA itself is left for finance to retry, so a
      //    standing problem is not hammered every five minutes.
      const owed = await this.prisma.cbaTransfer.findMany({
        where: {
          purpose: { in: OWED_PURPOSES },
          OR: [
            { status: CbaTransferStatus.PENDING, createdAt: { lt: settled } },
            {
              status: CbaTransferStatus.FAILED,
              failureReason: CBA_TRANSFER_REASON.CBA_UNAVAILABLE,
              updatedAt: { lt: settled },
            },
          ],
        },
        select: { transferId: true, status: true },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const transfer of owed) {
        try {
          if (transfer.status === CbaTransferStatus.PENDING) {
            await this.transfers.execute(transfer.transferId);
          } else {
            await this.transfers.retryOwed(transfer.transferId);
          }
        } catch (error) {
          this.logger.warn(`Owed transfer ${transfer.transferId} not sent: ${this.message(error)}`);
        }
      }

      return { withdrawals: waiting.length, transfers: owed.length };
    } finally {
      this.sweeping = false;
    }
  }

  private async lock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = this.redis.getClient() as unknown as {
        set: (...args: unknown[]) => Promise<string | null>;
      };

      return (await client.set(key, String(process.pid), 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (error) {
      // Without the lock, two instances could race. Skip this round.
      this.logger.warn(`Could not take ${key}: ${this.message(error)}`);
      return false;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown';
  }
}
