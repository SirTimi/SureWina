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
export const JOB_JACKPOT_ENTRY_SMS = 'jackpot-entry-sms';

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

export type JackpotEntrySmsJob = {
  // One job per mint, keyed on the accumulation row and the running weekly
  // total — a customer earning a second entry in the same week gets a second
  // message, but a retry of the same mint does not.
  accumId: string;
  buyerPhone: string;
  entriesMinted: number;
  entriesThisWeek: number;
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
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

    // Someone has just earned a free jackpot entry. Non-blocking like the
  // rest: the entry is already minted in the database, so a failed queue
  // costs a notification, not the prize.
  async enqueueJackpotEntrySms(job: JackpotEntrySmsJob): Promise<void> {
    try {
      await this.queue.add(JOB_JACKPOT_ENTRY_SMS, job, {
        // Keyed on the running weekly total, so the second entry of a week
        // sends its own message while a retry of the first does not.
        jobId: `jackpot-${job.accumId}-${job.entriesThisWeek}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue jackpot entry SMS for ${job.buyerPhone}: ${
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