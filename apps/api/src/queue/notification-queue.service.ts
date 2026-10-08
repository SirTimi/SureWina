import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

// Keep in sync with apps/worker/src/queue.contract.ts
export const NOTIFICATIONS_QUEUE = 'notifications';
export const JOB_TICKET_CONFIRMATION_SMS = 'ticket-confirmation-sms';
export const JOB_REDEMPTION_CODE_SMS = 'redemption-code-sms';
export const JOB_JACKPOT_OFFER_SMS = 'jackpot-offer-sms';

export type TicketConfirmationSmsJob = {
  txnId: string;
  buyerPhone: string;
  drawCode: string;
  drawScheduledAt: string;
  ticketRefs: string[];
  amountNgn: number;
};

export type RedemptionCodeSmsJob = {
  claimId: string;
  winnerPhone: string;
  code: string;
  prizeDescription: string;
  claimDeadlineAt: string;
  // Which issue this is. Zero on the original, incrementing per reissue —
  // without it both BullMQ and V2N treat the replacement as a duplicate of
  // the first and silently drop it.
  attempt?: number;
}

export type JackpotOfferSmsJob = {
  offerId: string;
  buyerPhone: string;
  offerPriceNgn: number;
  normalPriceNgn: number;
  jackpotScheduledAt: string;
  expiresAt: string;
};

@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private queue!: Queue;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.queue = new Queue(NOTIFICATIONS_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
        port: this.config.get<number>('REDIS_PORT') ?? 6379,
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        db: this.config.get<number>('REDIS_DB') ?? 0,
      },
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  // Never throws — a queue outage must not fail the webhook that already
  // committed the purchase. Worst case: SMS is late, reconciled later.
  async enqueueTicketConfirmationSms(
    job: TicketConfirmationSmsJob,
  ): Promise<void> {
    try {
      await this.queue.add(JOB_TICKET_CONFIRMATION_SMS, job, {
        jobId: `sms-${job.txnId}`, // idempotent: one SMS job per transaction
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue confirmation SMS for ${job.txnId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  // A retry of the same entitlement is the same notification.
  // Never let a queue outage roll back a confirmed ticket sale.
  async enqueueJackpotOfferSms(job: JackpotOfferSmsJob): Promise<void> {
    try {
      await this.queue.add(JOB_JACKPOT_OFFER_SMS, job, {
        jobId: `jackpot-offer-${job.offerId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
    } catch (error) {
      this.logger.error(
        `Unable to enqueue jackpot offer notice ${job.offerId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  async enqueueRedemptionCodeSms(
    job: RedemptionCodeSmsJob): Promise<void> {
    try {
      await this.queue.add(JOB_REDEMPTION_CODE_SMS, job, {
        // Reissues share a claim id, so the attempt number keeps them
        // distinct — without it BullMQ drops the second as a duplicate and
        // the winner never receives their replacement code.
        jobId: `redeem-${job.claimId}-${job.attempt ?? 0}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue redemption code SMS for ${job.claimId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}