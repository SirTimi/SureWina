
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { WalletModule } from '../../wallet/wallet.module';
import { AuditModule } from '../../audit/audit.module';
import { ClaimsModule } from '../../claims/claims.module';

import { WitmangoModule } from './witmango.module';
import { WitmangoWithdrawalService } from './witmango-withdrawal.service';
import { WitmangoWithdrawalController } from './witmango-withdrawal.controller';
import { WitmangoWithdrawalFinanceController } from './witmango-withdrawal-finance.controller';

import { CustomerJwtGuard } from '../../auth/guards/customer-jwt.guard';

@Module({
  imports: [
    JwtModule.register({}),
    WalletModule,
    AuditModule,
    ClaimsModule,
    WitmangoModule,
  ],
  controllers: [
    WitmangoWithdrawalController,
    WitmangoWithdrawalFinanceController,
  ],
  providers: [
    WitmangoWithdrawalService,
    CustomerJwtGuard,
  ],
})
export class WitmangoWithdrawalModule {}
