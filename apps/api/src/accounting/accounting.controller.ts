import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AdminRole, AdminTier } from '@prisma/client';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AccountingService } from './accounting.service';

class ReasonDto {
  @IsString() @Length(4, 500) reason!: string;
}

class MappingDto {
  @IsString() @Length(1, 40) glCode!: string;
  @IsString() @Length(2, 120) glName!: string;
}

class ExportQuery {
  @IsOptional() @IsIn(['summary', 'detail']) view?: 'summary' | 'detail';
}

type CsvRes = { header(k: string, v: string): unknown };

// Finance: month close, chart-of-accounts mapping and exports. Who may
// decide is checked in the service (finance proposes; a different senior
// admin approves).
@Controller('admin/accounting')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.FINANCE_OFFICER, AdminRole.OPERATOR, AdminRole.COMPLIANCE_OFFICER)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('periods')
  periods() {
    return this.accounting.listPeriods();
  }

  @Get('periods/:period')
  period(@Param('period') period: string) {
    return this.accounting.getPeriod(period);
  }

  @Post('periods/:period/propose-close')
  proposeClose(@Param('period') period: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.proposeClose(period, who(admin));
  }

  @Post('periods/:period/approve-close')
  approveClose(@Param('period') period: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.approveClose(period, who(admin));
  }

  @Post('periods/:period/reject-close')
  rejectClose(@Param('period') period: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.rejectClose(period, dto.reason, who(admin));
  }

  @Post('periods/:period/reopen')
  reopen(@Param('period') period: string, @Body() dto: ReasonDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.reopen(period, dto.reason, who(admin));
  }

  @Get('periods/:period/journal.csv')
  async journal(@Param('period') period: string, @Query() q: ExportQuery, @Res({ passthrough: true }) res: CsvRes) {
    const detail = q.view === 'detail';
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="surewina-journal-${period}-${detail ? 'detail' : 'summary'}.csv"`);
    return this.accounting.journalCsv(period, detail);
  }

  @Get('periods/:period/pnl')
  pnl(@Param('period') period: string) {
    return this.accounting.productPnl(period);
  }

  @Get('mappings')
  mappings() {
    return this.accounting.listMappings();
  }

  @Post('mappings/:internalKey')
  proposeMapping(@Param('internalKey') key: string, @Body() dto: MappingDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.proposeMapping(key, dto.glCode, dto.glName, who(admin));
  }

  @Post('mappings/:internalKey/approve')
  approveMapping(@Param('internalKey') key: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.approveMapping(key, who(admin));
  }

  @Post('mappings/:internalKey/reject')
  rejectMapping(@Param('internalKey') key: string, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.accounting.rejectMapping(key, who(admin));
  }
}

function who(admin: AdminJwtPayload) {
  return { sub: admin.sub, role: admin.role as AdminRole, tier: admin.tier as AdminTier };
}
