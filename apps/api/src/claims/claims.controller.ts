import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { ClaimsService } from './claims.service';
import { ChooseClaimDto } from './dto/choose-claim.dto';
import { SubmitBankDto, SubmitBvnDto } from './dto/kyc.dto';

@Controller('claims')
@UseGuards(CustomerJwtGuard)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get()
  listMine(@CurrentUser() user: CustomerJwtPayload) {
    return this.claimsService.listMine(user.phoneNumber);
  }

  @Get(':claimId')
  getMine(
    @Param('claimId') claimId: string,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.getMine(claimId, user.phoneNumber);
  }

  @Post(':claimId/choose')
  choose(
    @Param('claimId') claimId: string,
    @Body() dto: ChooseClaimDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.choose(claimId, user.phoneNumber, dto.path);
  }

  @Post(':claimId/kyc/bvn')
  submitBvn(
    @Param('claimId') claimId: string,
    @Body() dto: SubmitBvnDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.submitBvn(claimId, user.phoneNumber, dto.bvn);
  }

  @Post(':claimId/kyc/bank')
  submitBank(
    @Param('claimId') claimId: string,
    @Body() dto: SubmitBankDto,
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.claimsService.submitBank(
      claimId,
      user.phoneNumber,
      dto.accountNumber,
      dto.bankCode,
    );
  }
}