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
}

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

  async enqueueRedemptionCodeSms(job: {
    claimId: string;
    winnerPhone: string;
    code: string;
    prizeDescription: string;
    claimDeadlineAt: string;
  }) {
    await this.queue.add(JOB_REDEMPTION_CODE_SMS, job, {
      jobId: `redeem-${job.claimId}`, // one code, one send
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  }
}