import { Module } from '@nestjs/common';
import { AdminGovernanceController } from './admin-governance.controller.js';
import { AdminPermissionGuard } from './permissions/admin-permission.guard.js';

@Module({
  controllers: [AdminGovernanceController],
  providers: [AdminPermissionGuard],
})
export class AdminGovernanceModule {}
