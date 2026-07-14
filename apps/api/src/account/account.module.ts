import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClaimsModule } from '../claims/claims.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [JwtModule.register({}), ClaimsModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}