import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import {
  AuditActorType,
  PrizePayoutStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { PrizePayoutProviderRegistry } from './prize-payout-provider.registry';
import { PrizePayoutAttemptFinalizationService } from './prize-payout-attempt-finalization.service';

const SWEEP_MS = 5 * 60_000;
const STALE_AFTER_MS = 2 * 60_000;
const BATCH_SIZE = 50;

const RECOVERABLE_STATUSES: PrizePayoutStatus[] = [
  PrizePayoutStatus.REQUESTED,
  PrizePayoutStatus.SUBMITTED,
  PrizePayoutStatus.PROCESSING,
  PrizePayoutStatus.UNKNOWN,
];

@Injectable()
export class PrizePayoutRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger =
    new Logger(PrizePayoutRecoveryService.name);

  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PrizePayoutProviderRegistry,
    private readonly finalizer: PrizePayoutAttemptFinalizationService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.tick(),
      SWEEP_MS,
    );

    void this.tick();

    this.logger.log(
      'Prize payout recovery started (every 5m)',
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const cutoff =
        new Date(
          Date.now() -
          STALE_AFTER_MS,
        );

      const attempts =
        await this.prisma.prizePayoutAttempt.findMany({
          where: {
            status: {
              in:
                RECOVERABLE_STATUSES,
            },

            initiatedAt: {
              lte:
                cutoff,
            },

            OR: [
              {
                lastCheckedAt:
                  null,
              },
              {
                lastCheckedAt: {
                  lte:
                    cutoff,
                },
              },
            ],
          },

          orderBy: {
            initiatedAt:
              'asc',
          },

          take:
            BATCH_SIZE,
        });

      for (
        const attempt
        of attempts
      ) {
        try {
          const provider =
            this.providers.get(
              attempt.provider,
            );

          const reference =
            attempt.providerReference ??
            attempt.idempotencyKey;

          const result =
            await provider.getStatus(
              reference,
            );

          await this.finalizer.applyForAttempt(
            attempt.attemptId,
            result,
            {
              type:
                AuditActorType.SYSTEM,

              id:
                'prize-payout-recovery',
            },
          );
        } catch (error) {
          /*
           * Recovery NEVER initiates another transfer.
           *
           * A failed status query simply leaves the attempt
           * available for the next recovery cycle.
           */
          this.logger.warn(
            `Prize payout recovery failed for attempt ${attempt.attemptId}: ${
              error instanceof Error
                ? error.message
                : 'unknown'
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Prize payout recovery sweep failed: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    } finally {
      this.running =
        false;
    }
  }
}