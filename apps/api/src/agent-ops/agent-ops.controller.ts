import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AgentJwtGuard } from '../agent-auth/guards/agent-jwt.guard';
import { CurrentAgent } from '../agent-auth/guards/current-agent.decorator';
import { AgentJwtPayload } from '../agent-auth/agent-auth.types';
import { AgentSalesService } from './agent-sales.service';
import { SellTicketsDto } from './dto/sell-tickets.dto';
import { AgentStatsService } from './agent-stats.service';
import { AgentRemittanceService } from './agent-remittance.service';
import  { ConfirmRemittanceDto } from './dto/confirm-remittance.dto';
import { LookupPrizeDto } from './dto/lookup-prize.dto';
import { AgentPrizesService } from './agent-prizes.service';

@Controller('agent')
@UseGuards(AgentJwtGuard)
export class AgentOpsController {
  constructor(
    private readonly agentSales: AgentSalesService,
    private readonly agentRemittance: AgentRemittanceService,
    private readonly agentStats: AgentStatsService,
    private readonly agentPrizes: AgentPrizesService
  ) {}

  @Post('tickets/sell')
  sell(@CurrentAgent() agent: AgentJwtPayload, @Body() dto: SellTicketsDto) {
    return this.agentSales.sell(agent.sub, dto);
  }

  @Get('dashboard')
  dashboard(@CurrentAgent() agent: AgentJwtPayload) {
    return this.agentStats.dashboard(agent.sub);
  }

  @Get('sales')
  sales(
    @CurrentAgent() agent: AgentJwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.agentStats.sales(
      agent.sub,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }

  @Get('performance')
  performance(@CurrentAgent() agent: AgentJwtPayload) {
    return this.agentStats.performance(agent.sub);
  }

  @Get('remittance/current')
  remittanceCurrent(@CurrentAgent() a: AgentJwtPayload) {
    return this.agentRemittance.current(a.sub);
  }

  @Get('remittance/history')
  remittanceHistory(@CurrentAgent() a: AgentJwtPayload) {
    return this.agentRemittance.history(a.sub);
  }

  @Post('remittance/:remittanceId/confirm-payment')
  confirmRemittance(
    @CurrentAgent() a: AgentJwtPayload,
    @Param('remittanceId') remittanceId: string,
    @Body() dto: ConfirmRemittanceDto,
  ) {
    return this.agentRemittance.confirmPayment(a.sub, remittanceId, dto.bankTransferRef);
  }

  @Get('commission/summary')
  commissionSummary(@CurrentAgent() a: AgentJwtPayload) {
    return this.agentRemittance.commissionSummary(a.sub);
  }

  @Post('prizes/lookup')
  prizeLookup(@Body() dto: LookupPrizeDto) {
    return this.agentPrizes.lookup(dto.ticketRef);
  }

  @Post('prizes/log-payment')
  prizeLogPayment(@CurrentAgent() a: AgentJwtPayload, @Body() dto: LookupPrizeDto) {
    return this.agentPrizes.logPayment(a.sub, dto.ticketRef);
  }
}