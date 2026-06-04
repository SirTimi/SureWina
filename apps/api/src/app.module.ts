import { Module } from '@nestjs/common';
import { AdminGovernanceModule } from './admin/admin-governance.module.js';

@Module({
  imports: [AdminGovernanceModule],
})
export class AppModule {}
