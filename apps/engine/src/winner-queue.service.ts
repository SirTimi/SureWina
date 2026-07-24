import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

// Keep in sync with apps/worker/src/queue.contract.ts
const NOTIFICATIONS_QUEUE = 'notifications';
const JOB_WINNER_SMS = 'winner-sms';

export type WinnerSmsJob = {
  drawId: string;
  drawCode: string;
  drawScheduledAt: string;
  winnerPhone: string;
  winnerRef: string;
  prizeDescription: string;
  prizeValueNgn: number;
};

@Injectable()
export class WinnerQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WinnerQueueService.name);
  private queue!: Queue;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.queue = new Queue(NOTIFICATIONS_QUEUE, {
      connection: {
        host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
        port: this.config.get<number>('REDIS_PORT') ?? 6379,
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      },
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  // Never throws — a queue outage must not corrupt a completed draw.
  async enqueueWinnerSms(job: WinnerSmsJob): Promise<void> {
    try {
      await this.queue.add(JOB_WINNER_SMS, job, {
        jobId: `winner-${job.drawId}`, // one winner SMS per draw, ever
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue winner SMS for ${job.drawCode}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}