import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClaimsService } from './claims.service';
import { ClaimsController } from './claims.controller';
import { BvnVerificationService } from './kyc/bvn-verification.service';
import { BankResolveService } from './kyc/bank-resolve.service';
@Module({
  imports: [JwtModule.register({})], // CustomerJwtGuard injects JwtService
  controllers: [ClaimsController],
  providers: [ClaimsService, BvnVerificationService, BankResolveService],
  exports: [ClaimsService],
})
export class ClaimsModule {}