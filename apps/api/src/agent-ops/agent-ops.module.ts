import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsModule } from '../payments/payments.module';
import { AgentSalesService } from './agent-sales.service';
import { AgentOpsController } from './agent-ops.controller';
import { AgentStatsService } from './agent-stats.service';
import { AdminFinanceAgentsController } from './admin-finance-agents.controller';
@Module({
  imports: [JwtModule.register({}), PaymentsModule],
  controllers: [AgentOpsController, AdminFinanceAgentsController],
  providers: [AgentSalesService, AgentStatsService],
  exports: [AgentSalesService],
})
export class AgentOpsModule {}