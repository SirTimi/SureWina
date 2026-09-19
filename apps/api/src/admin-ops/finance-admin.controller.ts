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
  IsIn,
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
import { PaymentRefundService } from './payment-refund.service';

import {
  PrizePayoutEngineService,
} from '../claims/payout/prize-payout-engine.service';

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

class PrizePayoutProviderDto {
  @IsIn([
    'MONNIFY',
    'FLUTTERWAVE',
  ])
  provider!:
    | 'MONNIFY'
    | 'FLUTTERWAVE';
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

    private readonly refunds:
      PaymentRefundService,

    private readonly prizePayouts:
      PrizePayoutEngineService,
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

  /*
   * First payout attempt.
   *
   * Finance explicitly selects the payout rail.
   */
  @Post(
    'payouts/:claimId/initiate',
  )
  initiatePayout(
    @Param('claimId')
    claimId: string,

    @Body()
    dto: PrizePayoutProviderDto,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.prizePayouts.initiate(
      claimId,
      admin.sub,
      dto.provider,
    );
  }

  /*
   * Query the existing attempt.
   *
   * This never resends money.
   */
  @Post(
    'payouts/:claimId/refresh',
  )
  refreshPayout(
    @Param('claimId')
    claimId: string,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.prizePayouts.refreshCurrent(
      claimId,
      admin.sub,
    );
  }

  /*
   * Create another payout attempt.
   *
   * The engine allows this only when the latest attempt is
   * conclusively FAILED or REVERSED.
   *
   * UNKNOWN/SUBMITTED/PROCESSING cannot enter this path.
   */
  @Post(
    'payouts/:claimId/retry',
  )
  retryPayout(
    @Param('claimId')
    claimId: string,

    @Body()
    dto: PrizePayoutProviderDto,

    @CurrentAdmin()
    admin: AdminJwtPayload,
  ) {
    return this.prizePayouts.retry(
      claimId,
      admin.sub,
      dto.provider,
    );
  }

  /*
   * Immutable attempt history for Finance.
   */
  @Get(
    'payouts/:claimId/attempts',
  )
  payoutAttempts(
    @Param('claimId')
    claimId: string,
  ) {
    return this.prizePayouts.listAttempts(
      claimId,
    );
  }
}