import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminOpsController } from './admin-ops.controller';
import { CustomerAdminService } from './customer-admin.service'
import { AgentAdminController } from './agent-admin.controller'
import { AgentAdminService } from './agent-admin.service'
import { FinanceAdminService } from './finance-admin.service'
import { ComplianceAdminService} from './compliance-admin.service'
import { FinanceAdminController} from './finance-admin.controller'
import { ComplianceAdminController} from './compliance-admin.controller'
import {CustomerAdminController } from './customer-admin.controller'
import { DrawTemplateController }  from './draw-template.controller'
import { TicketAdminController } from './ticket-admin.controller'
import { SettingsAdminController } from './settings-admin.controller'
import { AuditModule } from '../audit/audit.module'
import { AdminNotificationsService } from './admin-notifications.service'
import { UserAdminController } from './user-admin.controller';
@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [
    AdminOpsController, 
    AgentAdminController, 
    ComplianceAdminController, 
    FinanceAdminController, 
    CustomerAdminController, 
    DrawTemplateController, 
    TicketAdminController, 
    SettingsAdminController,
    UserAdminController
  ],
  providers: [AdminDashboardService, CustomerAdminService, AgentAdminService, FinanceAdminService, ComplianceAdminService, AdminNotificationsService],
  exports: [CustomerAdminService]
})
export class AdminOpsModule {}