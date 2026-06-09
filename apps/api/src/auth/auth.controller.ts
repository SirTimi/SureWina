import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './guards/current-user.decorator';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';
import { CustomerJwtPayload } from './auth.types';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Get('me')
  @UseGuards(CustomerJwtGuard)
  getMe(@CurrentUser() user: CustomerJwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Post('sign-out')
  @UseGuards(CustomerJwtGuard)
  signOut(@CurrentUser() user: CustomerJwtPayload) {
    return this.authService.signOut(user.sub);
  }
}