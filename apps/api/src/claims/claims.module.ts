import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { BvnVerificationService } from './kyc/bvn-verification.service';
import { BankResolveService } from './kyc/bank-resolve.service';
import { AdminClaimsController } from './admin-claims.controller';
import { PaystackTransferService } from './payout/paystack-transfer.service';
import {WhtDeductionService } from './wht-deduction.service'
import { RedemptionService } from './redemption.service'
import { RedemptionController } from './redemption.controller'


@Module({
  imports: [JwtModule.register({})], // CustomerJwtGuard injects JwtService
  controllers: [ClaimsController, AdminClaimsController, RedemptionController],
  providers: [ClaimsService, BvnVerificationService, BankResolveService, PaystackTransferService, WhtDeductionService, RedemptionService],
  exports: [ClaimsService, BankResolveService, WhtDeductionService],
})
export class ClaimsModule {}