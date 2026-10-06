import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { CustomerJwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { JackpotOffersService } from './jackpot-offers.service';
import { PaymentsService } from './payments.service';
import { WalletTicketPurchaseService } from './wallet-ticket-purchase.service';
import { PromotionalJackpotPaystackPurchaseDto } from './dto/promotional-jackpot-paystack-purchase.dto';
import { PromotionalJackpotWalletPurchaseDto } from './dto/promotional-jackpot-wallet-purchase.dto';

@Controller('jackpot-offers')
@UseGuards(CustomerJwtGuard)
export class JackpotOffersController {
  constructor(
    private readonly offers: JackpotOffersService,
    private readonly payments: PaymentsService,
    private readonly walletPurchases: WalletTicketPurchaseService,
  ) {}

  @Get('current')
  current(
    @CurrentUser() user: CustomerJwtPayload,
  ) {
    return this.offers.current(user);
  }

  @Get(':offerId')
  get(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ) {
    return this.offers.get(user, offerId);
  }

  // Claim reserves the entitlement. The purchase endpoints below perform
  // the actual NGN 500 redemption and only then transition it to CLAIMED.
  @Post(':offerId/claim')
  claim(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ) {
    return this.offers.reserve(user, offerId);
  }

  @Post(':offerId/purchase/paystack')
  purchaseWithPaystack(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: PromotionalJackpotPaystackPurchaseDto,
  ) {
    return this.payments.initiatePromotionalJackpotPurchase(
      user,
      offerId,
      dto,
    );
  }

  @Post(':offerId/purchase/wallet')
  async purchaseWithWallet(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: PromotionalJackpotWalletPurchaseDto,
  ) {
    const offer = await this.offers.get(user, offerId);

    return this.walletPurchases.purchase(
      user.sub,
      {
        drawCode: offer.jackpotDrawCode,
        quantity: 1,
        stateOfPlayCode: dto.stateOfPlayCode,
        idempotencyKey: dto.idempotencyKey,
        jackpotDiscountOfferId: offerId,
      },
    );
  }

  @Post(':offerId/release')
  release(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ) {
    return this.offers.release(user, offerId);
  }

  @Post(':offerId/decline')
  decline(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ) {
    return this.offers.decline(user, offerId);
  }
}
