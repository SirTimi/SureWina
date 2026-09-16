import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';

import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';

import { WalletService } from './wallet.service';
import { CustomerWalletController } from './customer-wallet.controller';
import { WalletAdminController } from './wallet-admin.controller';

@Module({
  imports: [
    JwtModule.register({}),
    LedgerModule,
    AuditModule,
  ],
  controllers: [
    CustomerWalletController,
    WalletAdminController,
  ],
  providers: [
    WalletService,
    CustomerJwtGuard,
  ],
  exports: [
    WalletService,
  ],
})
export class WalletModule {}