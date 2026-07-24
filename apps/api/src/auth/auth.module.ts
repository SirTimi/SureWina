import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { AccountModule } from '../account/account.module'
import { OtpRateLimitGuard } from './guards/otp-rate-limit.guard'
@Module({
  imports: [JwtModule.register({}), AccountModule],
  controllers: [AuthController],
  providers: [AuthService, CustomerJwtGuard, OtpRateLimitGuard],
  exports: [AuthService],
})
export class AuthModule {}