import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminJwtGuard } from '../admin-auth/guards/admin-jwt.guard';
import { AdminRoleGuard } from '../admin-auth/guards/admin-role.guard';
import { AdminRoles } from '../admin-auth/decorators/admin-roles.decorator';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminJwtPayload } from '../admin-auth/admin-auth.types';
import { CurrentAdmin } from '../admin-auth/guards/current-admin.decorator';
import { AdminNotificationsService } from './admin-notifications.service';
@Controller('admin/dashboard')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@AdminRoles(AdminRole.OPERATOR)
export class AdminOpsController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly notifications: AdminNotificationsService
  ) {}

  @Get()
  summary() {
    return this.dashboard.summary();
  }

  @Get('jackpot')
  jackpot() {
    return this.dashboard.jackpotOverview();
  }

  @Get('notifications')
  listNotifications(@CurrentAdmin() admin: AdminJwtPayload) {
    return this.notifications.forAdmin(admin.role, admin.tier);
  }
}