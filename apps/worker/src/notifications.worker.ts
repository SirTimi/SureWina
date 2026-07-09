import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PrismaService } from './prisma.service';
import { TermiiService } from './termii.service';
import {
  JOB_TICKET_CONFIRMATION_SMS,
  NOTIFICATIONS_QUEUE,
  TicketConfirmationSmsJob,
} from './queue.contract';

@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private worker!: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly termii: TermiiService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      NOTIFICATIONS_QUEUE,
      async (job: Job) => {
        if (job.name === JOB_TICKET_CONFIRMATION_SMS) {
          await this.handleTicketConfirmation(job.data as TicketConfirmationSmsJob);
        } else {
          this.logger.warn(`Unknown job ${job.name} — ignoring`);
        }
      },
      {
        connection: {
          host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
          port: this.config.get<number>('REDIS_PORT') ?? 6379,
          password: this.config.get<string>('REDIS_PASSWORD') || undefined,
          db: this.config.get<number>('REDIS_DB') ?? 0,
        },
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });

    this.logger.log(`Worker listening on queue "${NOTIFICATIONS_QUEUE}"`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async handleTicketConfirmation(data: TicketConfirmationSmsJob) {
    const refs = data.ticketRefs.join(', ');
    const message =
      `Surewina: payment of NGN ${data.amountNgn.toLocaleString('en-NG')} confirmed. ` +
      `Your ticket${data.ticketRefs.length > 1 ? 's' : ''} for draw ${data.drawCode}: ${refs}. Good luck!`;

    await this.termii.sendSms(data.buyerPhone, message);

    await this.prisma.ticket.updateMany({
      where: { paymentTxnId: data.txnId },
      data: { confirmationSmsSentAt: new Date() },
    });

    this.logger.log(`Confirmation SMS processed for txn ${data.txnId} (${data.ticketRefs.length} tickets)`);
  }
}