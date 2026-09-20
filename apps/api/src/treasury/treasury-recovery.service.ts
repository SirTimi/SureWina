import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ReconciliationRunStatus,
  ReconciliationRunType,
  TreasuryProvider,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

import { TreasurySettlementService } from './treasury-settlement.service';
import { TreasuryReconciliationService } from './treasury-reconciliation.service';

const INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class TreasuryRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger =
    new Logger(TreasuryRecoveryService.name);

  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settlements: TreasurySettlementService,
    private readonly reconciliation: TreasuryReconciliationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.tick(),
      INTERVAL_MS,
    );

    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const now = new Date();
      const from = new Date(
        now.getTime() -
        3 * 24 * 60 * 60 * 1000,
      );

      if (
        this.config.get<string>(
          'FLUTTERWAVE_SECRET_KEY',
        )
      ) {
        try {
          await this.settlements.syncFlutterwave(
            from,
            now,
          );

          await this.reconciliation.snapshotProviderBalance(
            TreasuryProvider.FLUTTERWAVE,
          );
        } catch (error) {
          this.logger.warn(
            `Flutterwave treasury recovery failed: ${
              error instanceof Error
                ? error.message
                : 'unknown'
            }`,
          );
        }
      }

      const monnifyConfigured =
        Boolean(
          this.config.get<string>(
            'MONNIFY_API_KEY',
          ),
        ) &&
        Boolean(
          this.config.get<string>(
            'MONNIFY_SECRET_KEY',
          ),
        );

      if (
        monnifyConfigured &&
        this.config.get<string>(
          'MONNIFY_SOURCE_ACCOUNT_NUMBER',
        )
      ) {
        try {
          await this.reconciliation.snapshotProviderBalance(
            TreasuryProvider.MONNIFY,
          );
        } catch (error) {
          this.logger.warn(
            `Monnify balance snapshot failed: ${
              error instanceof Error
                ? error.message
                : 'unknown'
            }`,
          );
        }
      }

      const [
        previousDayFrom,
        previousDayTo,
      ] =
        this.previousWatDay();

      if (
        monnifyConfigured
      ) {
        await this.ensureDailyReconciliation(
          TreasuryProvider.MONNIFY,
          previousDayFrom,
          previousDayTo,
        );
      }

      if (
        this.config.get<string>(
          'FLUTTERWAVE_SECRET_KEY',
        )
      ) {
        await this.ensureDailyReconciliation(
          TreasuryProvider.FLUTTERWAVE,
          previousDayFrom,
          previousDayTo,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async ensureDailyReconciliation(
    provider: TreasuryProvider,
    from: Date,
    to: Date,
  ) {
    const existing =
      await this.prisma.reconciliationRun.findFirst({
        where: {
          runType:
            ReconciliationRunType.TRANSACTION,
          provider,
          periodFrom:
            from,
          periodTo:
            to,
          status: {
            in: [
              ReconciliationRunStatus.RUNNING,
              ReconciliationRunStatus.COMPLETED,
              ReconciliationRunStatus.COMPLETED_WITH_EXCEPTIONS,
            ],
          },
        },
        select: {
          runId:
            true,
        },
      });

    if (existing) {
      return;
    }

    try {
      await this.reconciliation.reconcileTransactions(
        provider,
        from,
        to,
      );
    } catch (error) {
      this.logger.warn(
        `${provider} daily transaction reconciliation failed: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    }
  }

  private previousWatDay(): [
    Date,
    Date,
  ] {
    const nowWat =
      new Date(
        Date.now() +
        60 * 60 * 1000,
      );

    const currentWatMidnightUtc =
      Date.UTC(
        nowWat.getUTCFullYear(),
        nowWat.getUTCMonth(),
        nowWat.getUTCDate(),
      );

    const previousWatStart =
      currentWatMidnightUtc -
      24 * 60 * 60 * 1000 -
      60 * 60 * 1000;

    const from =
      new Date(
        previousWatStart,
      );

    const to =
      new Date(
        previousWatStart +
        24 * 60 * 60 * 1000 -
        1,
      );

    return [
      from,
      to,
    ];
  }
}
