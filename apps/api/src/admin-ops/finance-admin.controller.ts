import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { IsISO8601, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { FinanceAdminService } from './finance-admin.service';

class ReconQueryDto {
  @IsISO8601()
  fromDate!: string;

  @IsISO8601()
  toDate!: string;
}

class RefundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

@Controller('admin/finance')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER)
export class FinanceAdminController {
  constructor(private readonly financeAdmin: FinanceAdminService) {}

  @Get('reconciliation')
  reconciliation(@Query() q: ReconQueryDto) {
    return this.financeAdmin.reconciliation(q.fromDate, q.toDate);
  }

  @Post('payments/:txnId/refund')
  refund(
    @Param('txnId') txnId: string,
    @Body() dto: RefundDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.financeAdmin.refund(txnId, admin.sub, dto.reason);
  }

  @Post('commissions/:disbId/retry')
  retryCommission(
    @Param('disbId') disbId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.financeAdmin.retryCommission(disbId, admin.sub);
  }
}