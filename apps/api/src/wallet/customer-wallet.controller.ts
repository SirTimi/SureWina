import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(CustomerJwtGuard)
export class CustomerWalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get()
  getMine(@CurrentUser() user: CustomerJwtPayload) {
    return this.wallets.getCustomerWallet(user.sub);
  }

  @Get('history')
  async history(
    @CurrentUser() user: CustomerJwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const wallet = await this.wallets.getCustomerWallet(user.sub);

    return this.wallets.history(
      wallet.walletId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }
}