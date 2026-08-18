import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PrismaService } from './prisma.service';
import { V2nSmsService } from './v2n-sms.service';
import {
  JOB_REDEMPTION_CODE_SMS,
  JOB_TICKET_CONFIRMATION_SMS,
  JOB_WINNER_SMS,
  RedemptionCodeSmsJob,
  WinnerSmsJob,
  NOTIFICATIONS_QUEUE,
  TicketConfirmationSmsJob,
} from './queue.contract';
import {
  redemptionCode,
  smsPlan,
  ticketPurchase,
  winnerNotice,
} from './sms-templates';



@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private worker!: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sms: V2nSmsService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      NOTIFICATIONS_QUEUE,
      async (job: Job) => {
        if (job.name === JOB_TICKET_CONFIRMATION_SMS) {
          await this.handleTicketConfirmation(job.data as TicketConfirmationSmsJob);
        } else if (job.name === JOB_WINNER_SMS) {
          await this.handleWinnerSms(job.data as WinnerSmsJob);
        } else if (job.name === JOB_REDEMPTION_CODE_SMS) {
          await this.handleRedemptionCode(job.data as RedemptionCodeSmsJob);
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

  private async handleWinnerSms(data: WinnerSmsJob) {
    // 1. Create the claim (idempotent: one claim per draw result).
    const result = await this.prisma.drawResult.findUnique({
      where: { drawId: data.drawId },
      select: { resultId: true },
    });
    if (!result) {
      throw new Error(`No draw result for ${data.drawCode} — retrying`);
    }

    const selectionDays = Number(
      this.config.get<string>('CLAIM_SELECTION_WINDOW_DAYS') ?? '7',
    );
    const claimDays = Number(
      this.config.get<string>('CLAIM_WINDOW_DAYS') ?? '30',
    );
    const now = Date.now();
    const claimDeadlineAt = new Date(now + claimDays * 86_400_000);

    let claimId: string;
    try {
      const claim = await this.prisma.prizeClaim.create({
        data: {
          drawResultId: result.resultId,
          winnerTicketRef: data.winnerRef,
          winnerPhone: data.winnerPhone,
          grossPrizeValueNgn: data.prizeValueNgn,
          netPrizeValueNgn: data.prizeValueNgn, // WHT applied at selection (8.5)
          selectionDeadlineAt: new Date(now + selectionDays * 86_400_000),
          claimDeadlineAt,
        },
      });
      claimId = claim.claimId;
      this.logger.log(`Claim created: ${claimId} for ${data.winnerRef}`);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Retry after a mid-run crash: claim exists, reuse it.
        const existing = await this.prisma.prizeClaim.findUniqueOrThrow({
          where: { drawResultId: result.resultId },
          select: { claimId: true },
        });
        claimId = existing.claimId;
      } else {
        throw error;
      }
    }

    // 2. Approved winner copy (SUREWINA_SMS_Draft), one segment.
    const message = winnerNotice({
      drawCode: data.drawCode,
      scheduledAt: data.drawScheduledAt,
      winnerRef: data.winnerRef,
      prizeDescription: data.prizeDescription,
      claimDeadlineAt,
    });

    // Stable id: a BullMQ retry after a delivered-but-unacknowledged send is
    // rejected by V2N as a duplicate rather than texting the winner twice.
    await this.sms.sendSms(data.winnerPhone, message, `win-${claimId}`);
    this.logger.log(`Winner SMS processed for draw ${data.drawCode} (claim ${claimId})`);
  }

  // The collection code. This is the only time it is ever readable — the
  // claim stores a hash — so a lost SMS cannot be resent from here. The job
  // payload is dropped on completion so the clear code does not linger in
  // Redis.
  private async handleRedemptionCode(data: RedemptionCodeSmsJob) {
    const message = redemptionCode({
      code: data.code,
      prizeDescription: data.prizeDescription,
      claimDeadline: data.claimDeadlineAt,
    });

    const plan = smsPlan(message);
    if (plan.segments > 1) {
      this.logger.log(
        `Redemption code SMS for claim ${data.claimId} is ${plan.length} ${plan.encoding} chars = ${plan.segments} segments`,
      );
    }

    await this.sms.sendSms(data.winnerPhone, message, `redeem-${data.claimId}`);

    // The code itself is never logged.
    this.logger.log(`Redemption code sent for claim ${data.claimId}`);
  }

  private async handleTicketConfirmation(data: TicketConfirmationSmsJob) {
    // The DB is the source of truth, not job.ticketRefs — each message needs
    // that ticket's own face value, and per-ticket send state has to survive
    // a retry.
    //
    // Ordering: tickets minted in one transaction usually share a createdAt
    // to the millisecond, so ticketRef breaks the tie. The ref is random, so
    // the order is arbitrary — but it is *stable*, which is what matters:
    // a retry must not renumber the slips a buyer already holds.
    const tickets = await this.prisma.ticket.findMany({
      where: { paymentTxnId: data.txnId },
      select: {
        ticketId: true,
        ticketRef: true,
        faceValueNgn: true,
        confirmationSmsSentAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { ticketRef: 'asc' }],
    });

    if (tickets.length === 0) {
      // Webhook raced ahead of the commit, or the txn id is wrong. Throwing
      // lets BullMQ back off and retry rather than silently sending nothing.
      throw new Error(`No tickets found for txn ${data.txnId} — retrying`);
    }

    if (tickets.length !== data.ticketRefs.length) {
      this.logger.warn(
        `Ticket count mismatch for txn ${data.txnId}: job says ${data.ticketRefs.length}, DB has ${tickets.length}. Sending on the DB.`,
      );
    }

    const total = tickets.length;
    let sent = 0;
    let alreadySent = 0;

    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];

      // Resuming a partial run: this one already went out.
      if (ticket.confirmationSmsSentAt) {
        alreadySent += 1;
        continue;
      }

      // Position comes from the full list, not the unsent remainder — on a
      // retry that resumes at ticket 3, it must still say "3 of 3".
      const message = ticketPurchase({
        drawCode: data.drawCode,
        scheduledAt: data.drawScheduledAt,
        ticketRef: ticket.ticketRef,
        faceValueNgn: ticket.faceValueNgn,
        sequence: { position: i + 1, total },
      });

      const plan = smsPlan(message);
      if (plan.segments > 1) {
        this.logger.warn(
          `SMS for ${ticket.ticketRef} is ${plan.length} ${plan.encoding} chars = ${plan.segments} segments (billed ${plan.segments}x)`,
        );
      }

      await this.sms.sendSms(data.buyerPhone, message, `tkt-${ticket.ticketRef}`);

      // Stamped immediately, one row at a time. A crash after this point
      // costs nothing; a crash before it re-sends only this ticket.
      await this.prisma.ticket.update({
        where: { ticketId: ticket.ticketId },
        data: { confirmationSmsSentAt: new Date() },
      });

      sent += 1;
    }

    this.logger.log(
      `Confirmation SMS for txn ${data.txnId}: ${sent} sent, ${alreadySent} already sent, ${total} tickets`,
    );
  }
}