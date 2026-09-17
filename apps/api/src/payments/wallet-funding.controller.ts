import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';

import { WalletFundingService } from './wallet-funding.service';
import { InitiateWalletFundingDto } from './dto/initiate-wallet-funding.dto';

@Controller('wallet/funding')
@UseGuards(CustomerJwtGuard)
export class WalletFundingController {
  constructor(private readonly funding: WalletFundingService) {}

  @Post('initiate')
  initiate(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: InitiateWalletFundingDto,
  ) {
    return this.funding.initiate(user.sub, dto);
  }

  @Get('status')
  status(
    @CurrentUser() user: CustomerJwtPayload,
    @Query('reference') reference: string,
    @Query('transactionId') transactionId?: string,
  ) {
    return this.funding.statusForCustomer(
      user.sub,
      reference,
      transactionId,
    );
  }

  @Get('history')
  history(
    @CurrentUser() user: CustomerJwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.funding.historyForCustomer(
      user.sub,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }
}