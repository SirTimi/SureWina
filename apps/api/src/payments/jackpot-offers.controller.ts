import {
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

@Controller('jackpot-offers')
@UseGuards(CustomerJwtGuard)
export class JackpotOffersController {
  constructor(
    private readonly offers: JackpotOffersService,
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

  // Phase 3 claim means reserve this entitlement for checkout.
  // Payment and the final CLAIMED transition are added in the next phase.
  @Post(':offerId/claim')
  claim(
    @CurrentUser() user: CustomerJwtPayload,
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
  ) {
    return this.offers.reserve(user, offerId);
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
