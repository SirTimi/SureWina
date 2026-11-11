import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';

import { WalletOnboardingService } from './wallet-onboarding.service';
import { OnboardWalletDto } from './dto/onboard-wallet.dto';

@Controller('wallet/onboarding')
@UseGuards(CustomerJwtGuard)
export class WalletOnboardingController {
  constructor(
    private readonly onboarding: WalletOnboardingService,
  ) {}

  // Where the signed-in customer stands: identity verified or not, and
  // whether their wallet is ready to fund.
  @Get()
  status(@CurrentUser() user: CustomerJwtPayload) {
    return this.onboarding.getStatus(user.sub);
  }

  // Safe to submit more than once. A repeat with the same BVN costs nothing
  // and picks up wherever the last attempt stopped.
  @Post()
  @HttpCode(200)
  onboard(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: OnboardWalletDto,
  ) {
    return this.onboarding.onboard(user.sub, dto);
  }
}