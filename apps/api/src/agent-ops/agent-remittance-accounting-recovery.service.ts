import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { AgentAccountingService } from './agent-accounting.service';

const SWEEP_MS = 5 * 60_000;
const BATCH_SIZE = 100;

@Injectable()
export class AgentRemittanceAccountingRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger =
    new Logger(
      AgentRemittanceAccountingRecoveryService.name,
    );

  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AgentAccountingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => void this.tick(),
      SWEEP_MS,
    );

    void this.tick();

    this.logger.log(
      'Agent remittance accounting recovery started (every 5m)',
    );
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
      const rows = await this.prisma.remittance.findMany({
        where: {
          OR: [
            {
              commissionNgn: { gt: 0 },
              commissionLedgerTxnId: null,
            },
            {
              amountDueNgn: { lt: 0 },
              walletCreditLedgerTxnId: null,
            },
            {
              amountDueNgn: 0,
              receivedAt: null,
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      for (const remittance of rows) {
        try {
          if (remittance.amountDueNgn < 0) {
            await this.accounting.creditNegativeRemittanceToWallet(
              remittance.remittanceId,
            );
          } else {
            await this.accounting.ensureRemittanceCommission(
              remittance.remittanceId,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Could not recover remittance accounting ${remittance.remittanceId}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Agent remittance accounting sweep failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
