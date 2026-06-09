import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { CustomerJwtPayload } from './auth.types';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CurrentUser } from './guards/current-user.decorator';
import { CustomerJwtGuard } from './guards/customer-jwt.guard';

type RequestWithCookies = FastifyRequest & {
  cookies?: Record<string, string>;
};

type ReplyWithCookie = FastifyReply & {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => FastifyReply;
  clearCookie: (name: string, options?: Record<string, unknown>) => FastifyReply;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('otp/verify')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) reply: ReplyWithCookie,
  ) {
    const result = await this.authService.verifyOtp(dto);

    this.setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);

    return this.toPublicAuthResponse(result);
  }

  @Post('refresh')
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) reply: ReplyWithCookie,
  ) {
    const refreshToken = this.getRefreshTokenFromRequest(request);

    const result = await this.authService.refresh(refreshToken);

    this.setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);

    return this.toPublicAuthResponse(result);
  }

  @Get('me')
  @UseGuards(CustomerJwtGuard)
  getMe(@CurrentUser() user: CustomerJwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Post('sign-out')
  @UseGuards(CustomerJwtGuard)
  async signOut(
    @CurrentUser() user: CustomerJwtPayload,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) reply: ReplyWithCookie,
  ) {
    const refreshToken = this.getRefreshTokenFromRequest(request, false);

    const result = await this.authService.signOut(user.sub, refreshToken);

    this.clearRefreshCookie(reply);

    return result;
  }

  private setRefreshCookie(
    reply: ReplyWithCookie,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const cookieName = this.authService.getRefreshCookieName();

    reply.setCookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/auth',
      expires: expiresAt,
      maxAge: Math.floor(this.authService.getRefreshCookieMaxAgeMs() / 1000),
    });
  }

  private clearRefreshCookie(reply: ReplyWithCookie) {
    const cookieName = this.authService.getRefreshCookieName();

    reply.clearCookie(cookieName, {
      path: '/v1/auth',
    });
  }

  private getRefreshTokenFromRequest(
    request: RequestWithCookies,
    required = true,
  ) {
    const cookieName = this.authService.getRefreshCookieName();
    const refreshToken = request.cookies?.[cookieName];

    if (!refreshToken && required) {
      return '';
    }

    return refreshToken;
  }

  private toPublicAuthResponse<T extends { refreshToken: string }>(result: T) {
    const { refreshToken: _refreshToken, ...publicResult } = result;

    return publicResult;
  }
}