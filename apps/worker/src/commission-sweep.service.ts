import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DisbStatus,
  RemittanceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from './prisma.service';

const SWEEP_MS = 5 * 60_000;

// Disburses commission for RECEIVED remittances that don't yet have a
// disbursement. Gross-in first, commission-out second — never pay
// commission on cash that hasn't landed. Dev mode: simulated payout ref.
@Injectable()
export class CommissionSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommissionSweepService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log('Commission sweep started (every 5m)');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const received = await this.prisma.remittance.findMany({
        where: { status: RemittanceStatus.RECEIVED, commissionNgn: { gt: 0 } },
        include: { agent: { select: { agentCode: true } } },
      });

      for (const rem of received) {
        const exists = await this.prisma.commissionDisbursement.findUnique({
          where: {
            agentId_periodDate: {
              agentId: rem.agentId,
              periodDate: rem.periodDate,
            },
          },
        });
        if (exists) continue;

        // Dev-mode payout (real Paystack Transfer wiring rides the same
        // PAYOUTS_MODE switch when we productionize).
        const reference = `DEV-COMM-${randomUUID()}`;
        try {
          const disb = await this.prisma.commissionDisbursement.create({
            data: {
              agentId: rem.agentId,
              periodDate: rem.periodDate,
              amountNgn: rem.commissionNgn,
              ticketCount: rem.ticketCount,
              status: DisbStatus.INITIATED,
              payoutReference: reference,
              initiatedAt: new Date(),
            },
          });
          await this.prisma.auditLog.create({
            data: {
              severity: AuditSeverity.INFO,
              actorType: AuditActorType.SYSTEM,
              action: 'COMMISSION_DISBURSED',
              resourceType: 'CommissionDisbursement',
              resourceId: disb.disbId,
              metadata: {
                agentCode: rem.agent.agentCode,
                amountNgn: rem.commissionNgn,
                reference,
              },
            },
          });
          this.logger.log(
            `[DEV COMMISSION] NGN ${rem.commissionNgn.toLocaleString('en-NG')} → ${rem.agent.agentCode} ref=${reference}`,
          );
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2002') throw error;
        }
      }
    } catch (error) {
      this.logger.error(
        `Commission sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}