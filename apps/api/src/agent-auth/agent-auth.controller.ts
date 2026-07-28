import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RequestOtpDto } from '../auth/dto/request-otp.dto';
import { VerifyOtpDto } from '../auth/dto/verify-otp.dto';
import { AgentAuthService } from './agent-auth.service';
import { AgentJwtPayload } from './agent-auth.types';
import { AgentJwtGuard } from './guards/agent-jwt.guard';
import { CurrentAgent } from './guards/current-agent.decorator';
import { Throttle } from '@nestjs/throttler'
import { OtpRateLimitGuard } from '../auth/guards/otp-rate-limit.guard'
@Controller('agents/auth')
export class AgentAuthController {
  constructor(private readonly agentAuthService: AgentAuthService) {}

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(OtpRateLimitGuard)
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.agentAuthService.requestOtp(dto);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.agentAuthService.verifyOtp(dto);
  }

  @Get('me')
  @UseGuards(AgentJwtGuard)
  getMe(@CurrentAgent() agent: AgentJwtPayload) {
    return this.agentAuthService.getMe(agent.sub);
  }
}