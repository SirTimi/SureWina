import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  // JwtModule is needed because AdminJwtGuard injects JwtService.
  imports: [JwtModule.register({})],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
