import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminRole,
  AdminTier,
  CbaTransferPurpose,
  CbaTransferStatus,
} from '@prisma/client';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { PrismaService } from '../database/prisma.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';

import { CbaReconciliationService } from './cba-reconciliation.service';

// Finance's view of CBA reconciliation, and the queue of CBA transfers that
// need a person.
@Controller('admin/finance/cba')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class CbaReconciliationAdminController {
  constructor(
    private readonly reconciliation: CbaReconciliationService,
    private readonly transfers: WitmangoTransferService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('reconciliation/runs')
  listRuns(@Query('limit') limit?: string) {
    return this.reconciliation.listRuns(Number(limit) || 30);
  }

  @Get('reconciliation/runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.reconciliation.getRun(runId);
  }

  // Runs a reconciliation now, outside the daily schedule.
  @Post('reconciliation/runs')
  run(@CurrentAdmin() admin: AdminJwtPayload) {
    this.requireWriter(admin);
    return this.reconciliation.run(admin.sub);
  }

  // Transfers that need a person: uncertain, stuck mid-send, or owed and
  // refused. Read-only here; resolving an uncertain transfer means checking
  // Witmango's own records first.
  @Get('transfers')
  async listTransfers(@Query('status') status?: string) {
    if (
      status &&
      !Object.values(CbaTransferStatus).includes(status as CbaTransferStatus)
    ) {
      throw new BadRequestException('Unknown transfer status');
    }

    const rows = await this.prisma.cbaTransfer.findMany({
      where: status
        ? { status: status as CbaTransferStatus }
        : {
            OR: [
              { status: CbaTransferStatus.UNCERTAIN },
              { status: CbaTransferStatus.SENDING },
              {
                status: CbaTransferStatus.FAILED,
                purpose: {
                  in: [
                    CbaTransferPurpose.AGENT_COMMISSION,
                    CbaTransferPurpose.PRIZE_REIMBURSEMENT,
                    CbaTransferPurpose.REVERSAL,
                    CbaTransferPurpose.WITHDRAWAL_RESTORE,
                  ],
                },
              },
            ],
          },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return rows.map((row) => ({
      transferId: row.transferId,
      reference: row.reference,
      purpose: row.purpose,
      status: row.status,
      amountNgn: row.amountNgn,
      walletId: row.walletId,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      walletPurchaseId: row.walletPurchaseId,
      paymentTxnId: row.paymentTxnId,
      prizeClaimId: row.prizeClaimId,
      saleReference: row.saleReference,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  // Sends again a refused commission or prize reimbursement.
  @Post('transfers/:transferId/retry')
  async retry(
    @Param('transferId') transferId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    this.requireWriter(admin);
    const result = await this.transfers.retryOwed(transferId);

    return {
      transferId: result.transferId,
      status: result.status,
      failureReason: result.failureReason,
    };
  }

  private requireWriter(admin: AdminJwtPayload) {
    if (admin.tier === AdminTier.AUDITOR) {
      throw new ForbiddenException('Auditor access is read-only');
    }
  }
}
