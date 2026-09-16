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
  PrizeClaimStatus,
} from '@prisma/client';

import {
  IsDateString,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';

import { FinanceAdminService } from './finance-admin.service';
import { ClaimsService } from '../claims/claims.service';
import { PaymentRefundService } from './payment-refund.service';

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

class ListPayoutsQueryDto {
  @IsOptional()
  @IsEnum(PrizeClaimStatus)
  status?: PrizeClaimStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

@Controller('admin/finance')
@UseGuards(
  AdminJwtGuard,
  AdminRoleGuard,
)
@AdminRoles(
  AdminRole.FINANCE_OFFICER,
)
export class FinanceAdminController {
  constructor(
    private readonly financeAdmin:
      FinanceAdminService,

    private readonly claimService:
      ClaimsService,

    private readonly refunds:
      PaymentRefundService,
  ) {}

  @Get('reconciliation')
  reconciliation(
    @Query()
    q: ReconQueryDto,
  ) {
    return this.financeAdmin.reconciliation(
      q.fromDate,
      q.toDate,
    );
  }

  /*
   * Initiate a full refund.
   *
   * Works for ordinary CONFIRMED payments and
   * REVIEW_REQUIRED payments where money was received
   * but tickets could not safely be issued.
   */
  @Post(
    'payments/:txnId/refund',
  )
  refund(
    @Param('txnId')
    txnId: string,

    @Body()
    dto: RefundDto,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.refunds.initiate(
      txnId,
      admin.sub,
      dto.reason,
    );
  }

  /*
   * Authenticated provider status refresh.
   *
   * This does NOT resend the refund.
   */
  @Post(
    'payments/:txnId/refund/refresh',
  )
  refreshRefund(
    @Param('txnId')
    txnId: string,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.refunds.refresh(
      txnId,
      admin.sub,
    );
  }

  @Get('refunds')
  listRefunds() {
    return this.refunds.listRefunds();
  }

  /*
   * Finance queue for:
   *
   * - late payments
   * - financial verification mismatches
   * - failed refunds
   * - otherwise unfulfilled successful payments
   */
  @Get('payments/review')
  listReviewRequired() {
    return this.refunds.listReviewRequired();
  }

  @Post(
    'commissions/:disbId/retry',
  )
  retryCommission(
    @Param('disbId')
    disbId: string,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.financeAdmin.retryCommission(
      disbId,
      admin.sub,
    );
  }

  @Get('payouts')
  listPayouts(
    @Query()
    q: ListPayoutsQueryDto,
  ) {
    return this.financeAdmin.listPayouts(
      q,
    );
  }

  @Post(
    'payouts/:claimId/initiate',
  )
  initiatePayout(
    @Param('claimId')
    claimId: string,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.claimService.initiatePayout(
      claimId,
      admin.sub,
    );
  }

  @Post(
    'payouts/:claimId/refresh',
  )
  refreshPayout(
    @Param('claimId')
    claimId: string,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.claimService.refreshPayoutStatus(
      claimId,
      admin.sub,
    );
  }
}