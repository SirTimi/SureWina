
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CustomerJwtGuard } from '../../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../../auth/auth.types';

import { WitmangoWithdrawalService } from './witmango-withdrawal.service';
import { CreateWalletWithdrawalDto } from './dto/create-wallet-withdrawal.dto';

@Controller('wallet/withdrawals')
@UseGuards(CustomerJwtGuard)
export class WitmangoWithdrawalController {
  constructor(
    private readonly withdrawals: WitmangoWithdrawalService,
  ) {}

  @Post()
  reserve(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: CreateWalletWithdrawalDto,
  ) {
    return this.withdrawals.reserve(
      user.sub,
      dto.requestId,
      dto.amountNgn,
    );
  }

  @Get()
  listMine(@CurrentUser() user: CustomerJwtPayload) {
    return this.withdrawals.listMine(user.sub);
  }

  @Get(':withdrawalId')
  getMine(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.withdrawals.getMine(
      user.sub,
      withdrawalId,
    );
  }

  @Post(':withdrawalId/cancel')
  cancelUnsubmitted(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.withdrawals.cancelUnsubmitted(
      user.sub,
      withdrawalId,
    );
  }
}
