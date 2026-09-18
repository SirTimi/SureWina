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

import { WalletTicketPurchaseDto } from './dto/wallet-ticket-purchase.dto';
import { WalletTicketPurchaseService } from './wallet-ticket-purchase.service';

@Controller('wallet/purchases')
@UseGuards(CustomerJwtGuard)
export class WalletTicketPurchaseController {
  constructor(
    private readonly purchases: WalletTicketPurchaseService,
  ) {}

  @Post()
  purchase(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: WalletTicketPurchaseDto,
  ) {
    return this.purchases.purchase(user.sub, dto);
  }

  @Get(':purchaseId')
  get(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.purchases.getPurchase(
      user.sub,
      purchaseId,
    );
  }
}