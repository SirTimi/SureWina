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
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { AgentAdminService, type OnboardAgentInput } from './agent-admin.service';

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

class OnboardAgentDto {
  @IsString() @Length(2, 120) fullName!: string;
  @Matches(/^\+234\d{10}$/, { message: 'phoneNumber must be E.164 Nigerian (+234…)' })
  phoneNumber!: string;
  @IsEmail() email!: string;
  @IsString() @Length(2, 10) registeredStateCode!: string;
  @Matches(/^\d{11}$/, { message: 'NIN must be 11 digits' }) nin!: string;
  @Matches(/^\d{11}$/, { message: 'BVN must be 11 digits' }) bvn!: string;
  @IsIn(['NIN_SLIP', 'DRIVERS_LICENCE', 'VOTERS_CARD', 'PASSPORT'])
  idDocType!: string;
  @IsOptional() @IsString() @Length(0, 1000) onboardingNote?: string;
}

import { DepartmentOnly } from '../admin-auth/decorators/department-only.decorator';

@Controller('admin/agents')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR, AdminRole.COMPLIANCE_OFFICER)
export class AgentAdminController {
  constructor(private readonly agentAdmin: AgentAdminService) {}

  @Get()
  list(@Query() q: ListAgentsQueryDto) {
    return this.agentAdmin.list(q.status);
  }

  @Post('onboard')
  onboard(@Body() dto: OnboardAgentDto, @CurrentAdmin() admin: AdminJwtPayload) {
    return this.agentAdmin.onboard(dto as OnboardAgentInput, admin.sub);
  }

  @Get(':agentId')
  detail(@Param('agentId') agentId: string) {
    return this.agentAdmin.detail(agentId);
  }

  @Post(':agentId/approve')
  @AdminRoles(AdminRole.COMPLIANCE_OFFICER)
  @DepartmentOnly()
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
  @AdminRoles(AdminRole.COMPLIANCE_OFFICER)
  @DepartmentOnly()
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