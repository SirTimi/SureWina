import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class AdminOpsController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  summary() {
    return this.dashboard.summary();
  }
}