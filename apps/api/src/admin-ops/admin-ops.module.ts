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
@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminOpsController, AgentAdminController, ComplianceAdminController, FinanceAdminController, CustomerAdminController, DrawTemplateController, TicketAdminController, SettingsAdminController],
  providers: [AdminDashboardService, CustomerAdminService, AgentAdminService, FinanceAdminService, ComplianceAdminService],
  exports: [CustomerAdminService]
})
export class AdminOpsModule {}