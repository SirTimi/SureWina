import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentAuthController } from './agent-auth.controller';
import { AgentAuthService } from './agent-auth.service';
import { AgentJwtGuard } from './guards/agent-jwt.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AgentAuthController],
  providers: [AgentAuthService, AgentJwtGuard],
  exports: [AgentAuthService, AgentJwtGuard],
})
export class AgentAuthModule {}