import {
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AdminRole,
  AuditActorType,
  AuditSeverity,
  RemittanceStatus,
} from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

@Controller('admin/finance/remittances')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class AdminFinanceAgentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post(':remittanceId/mark-received')
  async markReceived(
    @Param('remittanceId') id: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    const rem = await this.prisma.remittance.findUnique({
      where: { remittanceId: id },
    });
    if (!rem) throw new NotFoundException('Remittance not found');

    const updated = await this.prisma.remittance.update({
      where: { remittanceId: id },
      data: { status: RemittanceStatus.RECEIVED, receivedAt: new Date() },
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: admin.sub },
      action: 'REMITTANCE_RECEIVED',
      resource: { type: 'Remittance', id },
      metadata: { amountDueNgn: rem.amountDueNgn },
    });

    return updated;
  }
}