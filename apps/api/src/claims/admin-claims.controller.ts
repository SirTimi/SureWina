import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, PrizeClaimStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { ClaimsService } from './claims.service';

class ReviewKycDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class ListClaimsQueryDto {
  @IsOptional()
  @IsEnum(PrizeClaimStatus)
  status?: PrizeClaimStatus;
}

@Controller('admin/claims')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.COMPLIANCE_OFFICER)
export class AdminClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  list(@Query() query: ListClaimsQueryDto) {
    return this.claimsService.listForReview(query.status);
  }

  @Post(':claimId/kyc/review')
  review(
    @Param('claimId') claimId: string,
    @Body() dto: ReviewKycDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.claimsService.reviewKyc(claimId, admin.sub, dto.decision, dto.note);
  }
}