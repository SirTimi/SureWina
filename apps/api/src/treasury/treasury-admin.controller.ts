import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AdminRole,
  ReconciliationIssueStatus,
  TreasuryProvider,
} from '@prisma/client';

import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';

import { TreasuryReconciliationService } from './treasury-reconciliation.service';
import { TreasurySettlementService } from './treasury-settlement.service';

class DateRangeDto {
  @IsISO8601()
  fromDate!: string;

  @IsISO8601()
  toDate!: string;
}

class TransactionReconDto extends DateRangeDto {
  @IsIn(['MONNIFY', 'FLUTTERWAVE'])
  provider!: 'MONNIFY' | 'FLUTTERWAVE';
}

class ProviderQueryDto {
  @IsOptional()
  @IsIn(['MONNIFY', 'FLUTTERWAVE'])
  provider?: 'MONNIFY' | 'FLUTTERWAVE';
}

class IssueQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'IGNORED'])
  status?: ReconciliationIssueStatus;
}

class ResolveIssueDto {
  @IsIn(['RESOLVED', 'IGNORED'])
  status!:
    | 'RESOLVED'
    | 'IGNORED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class BankBalanceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  balanceNgn!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;
}

@Controller('admin/finance/treasury')
@UseGuards(
  AdminJwtGuard,
  AdminRoleGuard,
)
@AdminRoles(
  AdminRole.FINANCE_OFFICER,
)
export class TreasuryAdminController {
  constructor(
    private readonly reconciliation:
      TreasuryReconciliationService,
    private readonly settlements:
      TreasurySettlementService,
  ) {}

  @Get('overview')
  overview() {
    return this.reconciliation.overview();
  }

  @Get('settlements')
  settlementsList(
    @Query() query: ProviderQueryDto,
  ) {
    return this.settlements.list(
      query.provider
        ? TreasuryProvider[
            query.provider
          ]
        : undefined,
    );
  }

  @Post('settlements/flutterwave/sync')
  syncFlutterwave(
    @Body() body: DateRangeDto,
  ) {
    return this.settlements.syncFlutterwave(
      new Date(body.fromDate),
      new Date(body.toDate),
    );
  }

  @Post('reconciliation/run')
  run(
    @Body() body: TransactionReconDto,
  ) {
    return this.reconciliation.reconcileTransactions(
      TreasuryProvider[body.provider],
      new Date(body.fromDate),
      new Date(body.toDate),
    );
  }

  @Get('reconciliation/runs')
  runs() {
    return this.reconciliation.listRuns();
  }

  @Get('reconciliation/issues')
  issues(
    @Query() query: IssueQueryDto,
  ) {
    return this.reconciliation.listIssues(
      query.status ??
      ReconciliationIssueStatus.OPEN,
    );
  }

  @Post('reconciliation/issues/:issueId/resolve')
  resolveIssue(
    @Param('issueId') issueId: string,
    @Body() body: ResolveIssueDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.reconciliation.resolveIssue(
      issueId,
      admin.sub,
      body.status === 'RESOLVED'
        ? ReconciliationIssueStatus.RESOLVED
        : ReconciliationIssueStatus.IGNORED,
      body.note ?? '',
    );
  }

  @Post('balances/:provider/snapshot')
  snapshotProvider(
    @Param('provider') providerRaw: string,
  ) {
    const provider =
      providerRaw
        .trim()
        .toUpperCase();

    if (
      provider !== 'MONNIFY' &&
      provider !== 'FLUTTERWAVE'
    ) {
      throw new Error(
        'Provider must be MONNIFY or FLUTTERWAVE',
      );
    }

    return this.reconciliation.snapshotProviderBalance(
      TreasuryProvider[provider],
    );
  }

  @Post('balances/bank')
  bankBalance(
    @Body() body: BankBalanceDto,
  ) {
    return this.reconciliation.recordBankBalance(
      body.balanceNgn,
      body.externalReference ?? null,
    );
  }
}
