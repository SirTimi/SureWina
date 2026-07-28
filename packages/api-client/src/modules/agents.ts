import type {
  GetAgentMeResponse,
  RequestAgentOtpRequest,
  RequestAgentOtpResponse,
  VerifyAgentOtpRequest,
  VerifyAgentOtpResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

type PeriodAgg = { grossSalesNgn: number; ticketsSold: number; saleCount: number };

export interface AgentSalePrint {
  saleReference: string;
  terminal: string;
  drawNumber: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  drawName: string;
  drawShortCode: string;
  scheduledAt: string;
  cutoffAt: string;
  soldAt: string;
  ticketPriceNgn: number;
  amountNgn: number;
  tickets: string[];
}
export class AgentsModule {
  constructor(private readonly client: ApiClient) {}

  async requestOtp(req: RequestAgentOtpRequest): Promise<RequestAgentOtpResponse> {
    return this.client.post<RequestAgentOtpResponse>(
      '/agents/auth/otp/request',
      { phoneE164: req.phoneE164 },
      { skipAuth: true },
    );
  }

  async verifyOtp(req: VerifyAgentOtpRequest): Promise<VerifyAgentOtpResponse> {
    return this.client.post<VerifyAgentOtpResponse>(
      '/agents/auth/otp/verify',
      { challengeId: req.challengeId, otp: req.otp },
      { skipAuth: true },
    );
  }

  async getMe(): Promise<GetAgentMeResponse> {
    const res = await this.client.get<any>('/agents/auth/me');
    return (res.agent ? res : {agent: res }) as GetAgentMeResponse;
  }

  async signOut(): Promise<void> {
    await this.client.post('/agents/auth/sign-out', {}).catch(() => undefined);
  }

  async dashboard(): Promise<{
    agent: { agentCode: string; fullName: string; tier: string; commissionRate: number; status: string };
    today: { grossSalesNgn: number; ticketsSold: number; saleCount: number; commissionNgn: number };
    remittance: { owedNgn: number; status: string };
  }> {
    return this.client.get('/agent/dashboard');
  }

  async sales(page = 1, pageSize = 20): Promise<{
    sales: { saleReference: string; amountNgn: number; ticketCount: number; buyerPhone: string; soldAt: string | null }[];
    total: number; page: number; pageSize: number;
  }> {
    return this.client.get('/agent/sales', { query: { page, pageSize } });
  }

  async performance(): Promise<{
    today: PeriodAgg; week: PeriodAgg; month: PeriodAgg; allTime: PeriodAgg;
  }> {
    return this.client.get('/agent/performance');
  }

  async activeDraws(): Promise<{
    draws: { 
      drawCode: string;
      drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT'; 
      prizeDescription: string; 
      ticketPriceNgn: number; 
      scheduledAt: string; 
      cutoffAt: string }[];
  }> {
    return this.client.get('/draws/active', { skipAuth: true});
  }

  async sell(input: {
    drawCode: string;
    quantity: number;
    stateOfPlayCode: string;
    customerPhone?: string;
  }): Promise<{
    saleReference: string; drawCode: string; quantity: number;
    amountNgn: number; ticketRefs: string[]; customerNotified: boolean; soldAt: string;
  }> {
    return this.client.post('/agent/tickets/sell', {
      drawCode: input.drawCode,
      quantity: input.quantity,
      stateOfPlayCode: input.stateOfPlayCode,
      ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
    });
  }

  async remittanceCurrent(): Promise<{
    totalOwedNgn: number;
    remittances: { remittanceId: string; periodDate: string; grossSalesNgn: number; commissionNgn: number; amountDueNgn: number; ticketCount: number; status: string; bankTransferRef: string | null }[];
  }> {
    return this.client.get('/agent/remittance/current');
  }

  async remittanceHistory(): Promise<{
    remittances: { remittanceId: string; periodDate: string; grossSalesNgn: number; commissionNgn: number; amountDueNgn: number; ticketCount: number; status: string; bankTransferRef: string | null }[];
    total: number; page: number; pageSize: number;
  }> {
    return this.client.get('/agent/remittance/history');
  }

  async confirmRemittance(remittanceId: string, bankTransferRef: string): Promise<{
    remittanceId: string; status: string; bankTransferRef: string | null;
  }> {
    return this.client.post(
      `/agent/remittance/${encodeURIComponent(remittanceId)}/confirm-payment`,
      { bankTransferRef },
    );
  }

  async commissionSummary(): Promise<{
    totalPaidNgn: number;
    disbursements: { periodDate: string; amountNgn: number; status: string; payoutReference: string | null }[];
  }> {
    return this.client.get('/agent/commission/summary');
  }

  async prizeLookup(ticketRef: string): Promise<{
    ticketRef: string;
    isWinner: boolean;
    prizeDescription: string | null;
    grossPrizeValueNgn: number | null;
    claimStatus: string | null;
    agentPayableMaxNgn: number;
    agentPayable: boolean;
    reason: string | null;
  }> {
    return this.client.post('/agent/prizes/lookup', { ticketRef });
  }

  async prizeLogPayment(ticketRef: string): Promise<{
    paid: boolean;
    reference: string;
    ticketRef: string;
    amountNgn: number;
  }> {
    return this.client.post('/agent/prizes/log-payment', { ticketRef });
  }

  async saleForPrint(reference: string): Promise<AgentSalePrint> {
    return this.client.get(`/agent/tickets/sale/${encodeURIComponent(reference)}`);
  }
}