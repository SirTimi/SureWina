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

import { IdentityVerificationService } from './identity-verification.service';
import { VerifyBvnDto } from './dto/verify-bvn.dto';

@Controller('identity')
@UseGuards(CustomerJwtGuard)
export class IdentityController {
  constructor(
    private readonly identity: IdentityVerificationService,
  ) {}

  // Whether the signed-in customer has verified their identity. Returns
  // their verified name, never the BVN — which is not stored.
  @Get()
  status(@CurrentUser() user: CustomerJwtPayload) {
    return this.identity.getStatus(user.sub);
  }

  @Post('bvn')
  @HttpCode(200)
  verifyBvn(
    @CurrentUser() user: CustomerJwtPayload,
    @Body() dto: VerifyBvnDto,
  ) {
    return this.identity.verifyBvn(user.sub, dto);
  }
}