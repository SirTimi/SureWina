import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TreasuryProvider } from '@prisma/client';

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

      if (
        this.config.get<string>(
          'MONNIFY_API_KEY',
        ) &&
        this.config.get<string>(
          'MONNIFY_SECRET_KEY',
        ) &&
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
    } finally {
      this.running = false;
    }
  }
}
