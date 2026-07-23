import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsModule } from '../payments/payments.module';
import { AgentSalesService } from './agent-sales.service';
import { AgentOpsController } from './agent-ops.controller';
import { AgentStatsService } from './agent-stats.service';
import { AdminFinanceAgentsController } from './admin-finance-agents.controller';
import { AgentRemittanceService } from './agent-remittance.service';
import { AgentPrizesService } from './agent-prizes.service';
import { AdminOpsModule } from '../admin-ops/admin-ops.module'
import { AccountModule } from '../account/account.module'
import { ClaimsModule } from '../claims/claims.module'
import { IdentityVerificationService } from './kyc/identity-verification.service'
@Module({
  imports: [JwtModule.register({}), PaymentsModule, AdminOpsModule, AccountModule, ClaimsModule],
  controllers: [AgentOpsController, AdminFinanceAgentsController],
  providers: [AgentSalesService, AgentStatsService, AgentRemittanceService, AgentPrizesService, IdentityVerificationService],
  exports: [AgentSalesService],
})
export class AgentOpsModule {}