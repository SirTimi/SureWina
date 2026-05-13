/**
 * Local agent-portal mock store.
 *
 * Phase 4 of Surewina ships the agent portal against mocked data; the real
 * backend lands in Phase 6+. Everything here is in-memory and seeded with
 * realistic numbers so the UI can be reviewed end-to-end on the Tecno Camon
 * viewport at 3G.
 */

export type SalePeriod = 'today' | 'week' | 'month' | 'all-time';

export interface AgentSale {
  ticketRef: string;
  drawCode: string;
  drawLabel: string;
  ticketType: 'STANDARD' | 'JACKPOT';
  quantity: number;
  amountNgn: number;
  commissionNgn: number;
  customerPhone: string | null;
  soldAt: string; // ISO
}

export interface AgentDrawOption {
  drawCode: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  prizeDescription: string;
  ticketPriceNgn: number;
  scheduledAt: string;
  cutoffAt: string;
  isToday: boolean;
}

export interface RemittancePayment {
  remittanceId: string;
  periodStart: string;
  periodEnd: string;
  totalSalesNgn: number;
  commissionNgn: number;
  owedNgn: number;
  paidNgn: number;
  status: 'PENDING' | 'PAID' | 'LATE' | 'OVERDUE';
  paidAt: string | null;
  reference: string;
  bankReceiptRef: string | null;
}

export interface CommissionEntry {
  date: string; // YYYY-MM-DD
  salesNgn: number;
  ticketCount: number;
  commissionNgn: number;
  rate: number;
}

export interface AgentCustomer {
  phoneE164: string;
  lastSaleAt: string;
  ticketCount: number;
  totalSpendNgn: number;
}

export interface AgentSubAgent {
  agentCode: string;
  fullName: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  monthlyTicketCount: number;
  monthlySalesNgn: number;
  overrideEarnedNgn: number;
  status: 'ACTIVE' | 'PENDING_KYC' | 'SUSPENDED';
}

export interface TrainingModule {
  id: string;
  title: string;
  durationMins: number;
  description: string;
  completedAt: string | null;
  videoEmbedUrl: string;
}

// ---------- seed helpers ----------

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
function todayKey(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ---------- seeded data ----------

const seedSales: AgentSale[] = [
  {
    ticketRef: 'SW-04AB-9LK2',
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawLabel: 'Today daily · Samsung A55',
    ticketType: 'STANDARD',
    quantity: 1,
    amountNgn: 500,
    commissionNgn: 50,
    customerPhone: '+2348039019018',
    soldAt: isoMinutesAgo(220),
  },
  {
    ticketRef: 'SW-7K39-X2QP',
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawLabel: 'Saturday ₦4M jackpot',
    ticketType: 'JACKPOT',
    quantity: 1,
    amountNgn: 5000,
    commissionNgn: 500,
    customerPhone: '+2348067897712',
    soldAt: isoMinutesAgo(180),
  },
  {
    ticketRef: 'SW-1N2N-44TR',
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawLabel: 'Today daily · Samsung A55',
    ticketType: 'STANDARD',
    quantity: 1,
    amountNgn: 500,
    commissionNgn: 50,
    customerPhone: null,
    soldAt: isoMinutesAgo(95),
  },
  {
    ticketRef: 'SW-9C04-XX01',
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawLabel: 'Today daily · Samsung A55',
    ticketType: 'STANDARD',
    quantity: 3,
    amountNgn: 1500,
    commissionNgn: 150,
    customerPhone: '+2348022114401',
    soldAt: isoMinutesAgo(34),
  },
];

const seedRemittances: RemittancePayment[] = [
  {
    remittanceId: 'rem_demo_0001',
    periodStart: isoDaysAgo(1),
    periodEnd: isoDaysAgo(1),
    totalSalesNgn: 28500,
    commissionNgn: 2850,
    owedNgn: 25650,
    paidNgn: 25650,
    status: 'PAID',
    paidAt: isoDaysAgo(1),
    reference: 'SWREM-481723-20260426',
    bankReceiptRef: 'GTB-TRF-883401',
  },
  {
    remittanceId: 'rem_demo_0002',
    periodStart: isoDaysAgo(2),
    periodEnd: isoDaysAgo(2),
    totalSalesNgn: 31000,
    commissionNgn: 3100,
    owedNgn: 27900,
    paidNgn: 27900,
    status: 'PAID',
    paidAt: isoDaysAgo(2),
    reference: 'SWREM-481723-20260425',
    bankReceiptRef: 'GTB-TRF-872210',
  },
  {
    remittanceId: 'rem_demo_0003',
    periodStart: isoDaysAgo(3),
    periodEnd: isoDaysAgo(3),
    totalSalesNgn: 18000,
    commissionNgn: 1800,
    owedNgn: 16200,
    paidNgn: 16200,
    status: 'LATE',
    paidAt: isoDaysAgo(2),
    reference: 'SWREM-481723-20260424',
    bankReceiptRef: 'GTB-TRF-865011',
  },
  {
    remittanceId: 'rem_demo_0004',
    periodStart: isoDaysAgo(4),
    periodEnd: isoDaysAgo(4),
    totalSalesNgn: 22500,
    commissionNgn: 2250,
    owedNgn: 20250,
    paidNgn: 20250,
    status: 'PAID',
    paidAt: isoDaysAgo(4),
    reference: 'SWREM-481723-20260423',
    bankReceiptRef: 'GTB-TRF-855310',
  },
];

const seedCommission: CommissionEntry[] = Array.from({ length: 30 }).map((_, i) => {
  const tickets = 18 + Math.floor(Math.random() * 30);
  const salesNgn = tickets * 500 + (i % 4 === 0 ? 5000 : 0);
  const rate = 0.1;
  return {
    date: todayKey(-i),
    salesNgn,
    ticketCount: tickets,
    commissionNgn: Math.round(salesNgn * rate),
    rate,
  };
});

const seedCustomers: AgentCustomer[] = [
  {
    phoneE164: '+2348039019018',
    lastSaleAt: isoMinutesAgo(220),
    ticketCount: 14,
    totalSpendNgn: 12000,
  },
  {
    phoneE164: '+2348067897712',
    lastSaleAt: isoMinutesAgo(180),
    ticketCount: 6,
    totalSpendNgn: 22500,
  },
  {
    phoneE164: '+2348022114401',
    lastSaleAt: isoMinutesAgo(34),
    ticketCount: 9,
    totalSpendNgn: 8000,
  },
  {
    phoneE164: '+2348051145567',
    lastSaleAt: isoDaysAgo(3),
    ticketCount: 4,
    totalSpendNgn: 2000,
  },
  {
    phoneE164: '+2349088172201',
    lastSaleAt: isoDaysAgo(7),
    ticketCount: 12,
    totalSpendNgn: 11500,
  },
];

const seedSubAgents: AgentSubAgent[] = [
  {
    agentCode: 'RD-AGT-991100',
    fullName: 'Adaeze Nwosu',
    tier: 'BRONZE',
    monthlyTicketCount: 142,
    monthlySalesNgn: 71000,
    overrideEarnedNgn: 1420,
    status: 'ACTIVE',
  },
  {
    agentCode: 'RD-AGT-992011',
    fullName: 'Sade Bello',
    tier: 'SILVER',
    monthlyTicketCount: 284,
    monthlySalesNgn: 142000,
    overrideEarnedNgn: 2840,
    status: 'ACTIVE',
  },
  {
    agentCode: 'RD-AGT-993034',
    fullName: 'Kunle Adeyemi',
    tier: 'BRONZE',
    monthlyTicketCount: 38,
    monthlySalesNgn: 19000,
    overrideEarnedNgn: 380,
    status: 'PENDING_KYC',
  },
];

const seedTraining: TrainingModule[] = [
  {
    id: 'trn_intro',
    title: 'Welcome to Surewina agents',
    durationMins: 3,
    description: 'How the agent platform works and what your responsibilities are.',
    completedAt: isoDaysAgo(30),
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 'trn_sale_flow',
    title: 'Selling a ticket in 60 seconds',
    durationMins: 4,
    description: 'The fastest path from "I want a ticket" to a confirmed reference.',
    completedAt: isoDaysAgo(28),
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 'trn_remittance',
    title: 'Daily remittance & deadlines',
    durationMins: 5,
    description: 'Why the 23:00 cutoff matters and how the grace window works.',
    completedAt: null,
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 'trn_pay_prize',
    title: 'Paying customer prizes safely',
    durationMins: 4,
    description: 'Threshold checks, verification and logging the payout.',
    completedAt: null,
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
];

// ---------- exposed mock state (mutable) ----------

const state = {
  sales: [...seedSales],
  remittances: [...seedRemittances],
  commission: seedCommission,
  customers: [...seedCustomers],
  subAgents: seedSubAgents,
  training: seedTraining,
  prizePayments: [] as Array<{
    ticketRef: string;
    paidAt: string;
    paidNgn: number;
    method: 'CASH' | 'TRANSFER';
    customerPhone: string | null;
  }>,
};

// ---------- draw catalog ----------

function endOfDay(): string {
  const d = new Date();
  d.setHours(23, 0, 0, 0);
  return d.toISOString();
}
function inHours(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

export const AGENT_DRAW_CATALOG: AgentDrawOption[] = [
  {
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Samsung Galaxy A55 5G',
    ticketPriceNgn: 500,
    scheduledAt: inHours(8),
    cutoffAt: endOfDay(),
    isToday: true,
  },
  {
    drawCode: 'RD-DRAW-20260428-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Hisense 55" U7 TV',
    ticketPriceNgn: 500,
    scheduledAt: inHours(32),
    cutoffAt: inHours(31),
    isToday: false,
  },
  {
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: 'Saturday ₦4M jackpot',
    ticketPriceNgn: 5000,
    scheduledAt: inHours(120),
    cutoffAt: inHours(119),
    isToday: false,
  },
];

// ---------- service ----------

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export const agentMock = {
  listDraws(): AgentDrawOption[] {
    return AGENT_DRAW_CATALOG;
  },

  getDraw(drawCode: string): AgentDrawOption | undefined {
    return AGENT_DRAW_CATALOG.find((d) => d.drawCode === drawCode);
  },

  todaysDraw(): AgentDrawOption {
    return AGENT_DRAW_CATALOG.find((d) => d.isToday) ?? AGENT_DRAW_CATALOG[0];
  },

  async listSales(period: SalePeriod = 'today'): Promise<AgentSale[]> {
    await sleep(80);
    const now = Date.now();
    const cutoff: Record<SalePeriod, number> = {
      today: now - 24 * 60 * 60 * 1000,
      week: now - 7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      'all-time': 0,
    };

    if (period === 'today') {
      // strict same-day match
      const today = new Date().toISOString().slice(0, 10);
      return state.sales.filter((s) => s.soldAt.slice(0, 10) === today);
    }

    return state.sales.filter((s) => new Date(s.soldAt).getTime() >= cutoff[period]);
  },

  /**
   * Record a sale — simulates the backend purchase + ticket-issue flow.
   * Returns the new tickets so the confirmation screen can render the refs.
   */
  async recordSale(input: {
    drawCode: string;
    quantity: number;
    customerPhone?: string | null;
  }): Promise<{ sale: AgentSale }> {
    await sleep(420); // simulate network on 3G — keep this brief so the 60s budget holds
    const draw = agentMock.getDraw(input.drawCode);
    if (!draw) throw new Error('Unknown draw.');

    const qty = Math.max(1, Math.min(50, Math.floor(input.quantity)));
    const amount = qty * draw.ticketPriceNgn;
    const commission = Math.round(amount * 0.1);
    const ref = generateTicketRef();

    const sale: AgentSale = {
      ticketRef: ref,
      drawCode: draw.drawCode,
      drawLabel: draw.isToday
        ? `Today daily · ${draw.prizeDescription}`
        : draw.prizeDescription,
      ticketType: draw.drawType === 'SATURDAY_JACKPOT' ? 'JACKPOT' : 'STANDARD',
      quantity: qty,
      amountNgn: amount,
      commissionNgn: commission,
      customerPhone: input.customerPhone?.trim() || null,
      soldAt: new Date().toISOString(),
    };

    state.sales = [sale, ...state.sales];

    if (sale.customerPhone) {
      const existing = state.customers.find((c) => c.phoneE164 === sale.customerPhone);
      if (existing) {
        existing.ticketCount += qty;
        existing.totalSpendNgn += amount;
        existing.lastSaleAt = sale.soldAt;
      } else {
        state.customers.unshift({
          phoneE164: sale.customerPhone,
          lastSaleAt: sale.soldAt,
          ticketCount: qty,
          totalSpendNgn: amount,
        });
      }
    }

    return { sale };
  },

  async getSaleByRef(ref: string): Promise<AgentSale | null> {
    await sleep(60);
    return state.sales.find((s) => s.ticketRef === ref) ?? null;
  },

  // ---------- remittance ----------

  async getRemittanceStatus(): Promise<{
    owedNgn: number;
    salesTodayNgn: number;
    deadlineAt: string;
    overdue: boolean;
    bankInstructions: {
      bankName: string;
      accountNumber: string;
      accountName: string;
      reference: string;
    };
  }> {
    await sleep(80);
    const todays = await agentMock.listSales('today');
    const salesNgn = todays.reduce((sum, s) => sum + s.amountNgn, 0);
    const commission = todays.reduce((sum, s) => sum + s.commissionNgn, 0);
    return {
      owedNgn: Math.max(0, salesNgn - commission),
      salesTodayNgn: salesNgn,
      deadlineAt: endOfDay(),
      overdue: false,
      bankInstructions: {
        bankName: 'Guaranty Trust Bank',
        accountNumber: '0123456789',
        accountName: 'SUREWINA REMIT POOL',
        reference: `SWREM-481723-${new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, '')}`,
      },
    };
  },

  async confirmRemittancePayment(input: {
    amountNgn: number;
    bankReceiptRef: string;
    paidAt?: string;
  }): Promise<RemittancePayment> {
    await sleep(220);
    const today = new Date();
    const remit: RemittancePayment = {
      remittanceId: `rem_live_${Math.random().toString(36).slice(2, 9)}`,
      periodStart: today.toISOString(),
      periodEnd: today.toISOString(),
      totalSalesNgn: input.amountNgn,
      commissionNgn: Math.round(input.amountNgn * 0.1),
      owedNgn: input.amountNgn,
      paidNgn: input.amountNgn,
      status: 'PAID',
      paidAt: input.paidAt ?? new Date().toISOString(),
      reference: `SWREM-481723-${today
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}`,
      bankReceiptRef: input.bankReceiptRef.trim(),
    };
    state.remittances = [remit, ...state.remittances];
    return remit;
  },

  async listRemittanceHistory(): Promise<RemittancePayment[]> {
    await sleep(80);
    return [...state.remittances].sort((a, b) =>
      (b.paidAt ?? b.periodEnd).localeCompare(a.paidAt ?? a.periodEnd),
    );
  },

  // ---------- commission ----------

  async getCommissionSummary(): Promise<{
    today: { ticketCount: number; salesNgn: number; commissionNgn: number };
    mtd: { ticketCount: number; salesNgn: number; commissionNgn: number };
    rate: number;
    nextTierTicketsRequired: number;
    entries: CommissionEntry[];
  }> {
    await sleep(80);
    const today = state.commission[0];
    const mtd = state.commission.slice(0, new Date().getDate()).reduce(
      (acc, entry) => ({
        ticketCount: acc.ticketCount + entry.ticketCount,
        salesNgn: acc.salesNgn + entry.salesNgn,
        commissionNgn: acc.commissionNgn + entry.commissionNgn,
      }),
      { ticketCount: 0, salesNgn: 0, commissionNgn: 0 },
    );
    return {
      today: {
        ticketCount: today.ticketCount,
        salesNgn: today.salesNgn,
        commissionNgn: today.commissionNgn,
      },
      mtd,
      rate: 0.1,
      nextTierTicketsRequired: Math.max(0, 400 - mtd.ticketCount),
      entries: state.commission,
    };
  },

  buildStatementCsv(period: 'daily' | 'monthly'): string {
    const entries =
      period === 'daily' ? state.commission.slice(0, 1) : state.commission.slice(0, 30);
    const lines = [
      'date,tickets,sales_ngn,commission_ngn,rate',
      ...entries.map(
        (e) =>
          `${e.date},${e.ticketCount},${e.salesNgn},${e.commissionNgn},${e.rate.toFixed(2)}`,
      ),
    ];
    return lines.join('\n');
  },

  // ---------- pay prize ----------

  async lookupPrizeTicket(ticketRef: string): Promise<{
    found: boolean;
    isWinner: boolean;
    prizeDescription: string | null;
    prizeValueNgn: number | null;
    requiresKyc: boolean;
    canAgentPay: boolean;
    note: string;
  }> {
    await sleep(220);
    const ref = ticketRef.trim().toUpperCase();
    const known: Record<
      string,
      {
        isWinner: boolean;
        prize: string;
        ngn: number;
      }
    > = {
      'SW-04AB-9LK2': { isWinner: true, prize: 'Hisense 55" U7 TV', ngn: 540000 },
      'SW-04AB-9LK3': { isWinner: false, prize: '', ngn: 0 },
      'SW-7K39-X2QP': { isWinner: true, prize: 'Saturday ₦4M jackpot', ngn: 4000000 },
      'SW-COIN-2000': { isWinner: true, prize: '₦2,000 cash', ngn: 2000 },
    };
    const match = known[ref];
    if (!match) {
      return {
        found: false,
        isWinner: false,
        prizeDescription: null,
        prizeValueNgn: null,
        requiresKyc: false,
        canAgentPay: false,
        note: 'Ticket not found. Check the reference and try again.',
      };
    }
    if (!match.isWinner) {
      return {
        found: true,
        isWinner: false,
        prizeDescription: null,
        prizeValueNgn: null,
        requiresKyc: false,
        canAgentPay: false,
        note: 'This ticket is not a winner.',
      };
    }
    const requiresKyc = match.ngn > 5000;
    return {
      found: true,
      isWinner: true,
      prizeDescription: match.prize,
      prizeValueNgn: match.ngn,
      requiresKyc,
      canAgentPay: !requiresKyc,
      note: requiresKyc
        ? 'Prize over ₦5,000 — customer must claim via the customer app for KYC.'
        : 'You can pay this prize directly. Verify customer ID before handing cash.',
    };
  },

  async logPrizePayment(input: {
    ticketRef: string;
    paidNgn: number;
    method: 'CASH' | 'TRANSFER';
    customerPhone: string | null;
  }): Promise<void> {
    await sleep(180);
    state.prizePayments.unshift({
      ticketRef: input.ticketRef,
      paidNgn: input.paidNgn,
      method: input.method,
      customerPhone: input.customerPhone,
      paidAt: new Date().toISOString(),
    });
  },

  // ---------- customers / network ----------

  async listCustomers(): Promise<AgentCustomer[]> {
    await sleep(80);
    return [...state.customers].sort((a, b) =>
      b.lastSaleAt.localeCompare(a.lastSaleAt),
    );
  },

  async listSubAgents(): Promise<AgentSubAgent[]> {
    await sleep(80);
    return [...state.subAgents];
  },

  async getSubAgent(code: string): Promise<AgentSubAgent | null> {
    await sleep(80);
    return state.subAgents.find((a) => a.agentCode === code) ?? null;
  },

  // ---------- training ----------

  listTrainingModules(): TrainingModule[] {
    return state.training;
  },

  completeTraining(id: string): void {
    const m = state.training.find((t) => t.id === id);
    if (m && !m.completedAt) m.completedAt = new Date().toISOString();
  },
};

function generateTicketRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join(
      '',
    );
  return `SW-${part(4)}-${part(4)}`;
}
