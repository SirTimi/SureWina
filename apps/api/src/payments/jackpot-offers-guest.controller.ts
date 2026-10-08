import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { JackpotOffersService } from './jackpot-offers.service';

class DeclineGuestOfferDto {
  @IsString()
  @IsNotEmpty()
  reference!: string;
}

// Unauthenticated guest purchases have no CustomerJwtPayload yet.
// The opaque confirmed SW-PAY reference grants only the right to decline
// the offer created by that particular purchase.
@Controller('jackpot-offers')
export class JackpotOffersGuestController {
  constructor(private readonly offers: JackpotOffersService) {}

  @Post(':offerId/decline-from-purchase')
  declineFromPurchase(
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body() dto: DeclineGuestOfferDto,
  ) {
    return this.offers.declineFromPurchaseReference(
      offerId,
      dto.reference,
    );
  }
}
