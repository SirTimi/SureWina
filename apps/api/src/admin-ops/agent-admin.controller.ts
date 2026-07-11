import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, AgentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AgentAdminService } from './agent-admin.service';

class ListAgentsQueryDto {
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;
}

class AgentActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@Controller('admin/agents')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class AgentAdminController {
  constructor(private readonly agentAdmin: AgentAdminService) {}

  @Get()
  list(@Query() q: ListAgentsQueryDto) {
    return this.agentAdmin.list(q.status);
  }

  @Get(':agentId')
  detail(@Param('agentId') agentId: string) {
    return this.agentAdmin.detail(agentId);
  }

  @Post(':agentId/approve')
  approve(@Param('agentId') id: string, @CurrentAdmin() a: AdminJwtPayload) {
    return this.agentAdmin.transition(id, 'APPROVE', a.sub);
  }

  @Post(':agentId/suspend')
  suspend(
    @Param('agentId') id: string,
    @Body() dto: AgentActionDto,
    @CurrentAdmin() a: AdminJwtPayload,
  ) {
    return this.agentAdmin.transition(id, 'SUSPEND', a.sub, dto.reason);
  }

  @Post(':agentId/reactivate')
  reactivate(@Param('agentId') id: string, @CurrentAdmin() a: AdminJwtPayload) {
    return this.agentAdmin.transition(id, 'REACTIVATE', a.sub);
  }

  @Post(':agentId/terminate')
  terminate(
    @Param('agentId') id: string,
    @Body() dto: AgentActionDto,
    @CurrentAdmin() a: AdminJwtPayload,
  ) {
    return this.agentAdmin.transition(id, 'TERMINATE', a.sub, dto.reason);
  }
}