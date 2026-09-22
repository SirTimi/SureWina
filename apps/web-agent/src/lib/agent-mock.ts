/**
 * Temporary local data for agent-portal screens that do not yet have a
 * backend source. Financial operations are intentionally absent: sales,
 * wallet balances, prize payouts, commission, and remittance all use the
 * real API/ledger paths.
 */

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

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

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
    description: 'The fastest path from customer cash to a prepaid wallet-backed ticket sale.',
    completedAt: isoDaysAgo(28),
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 'trn_wallet',
    title: 'Prepaid wallet & historical remittance',
    durationMins: 5,
    description:
      'How wallet top-ups, per-sale deductions, retained commission, and old remittance balances work.',
    completedAt: null,
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
  {
    id: 'trn_pay_prize',
    title: 'Paying customer prizes safely',
    durationMins: 4,
    description: 'Threshold checks, verification, payout logging, and wallet reimbursement.',
    completedAt: null,
    videoEmbedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  },
];

const state = {
  customers: [...seedCustomers],
  subAgents: [...seedSubAgents],
  training: [...seedTraining],
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const agentMock = {
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
    return state.subAgents.find((agent) => agent.agentCode === code) ?? null;
  },

  listTrainingModules(): TrainingModule[] {
    return state.training;
  },

  completeTraining(id: string): void {
    const module = state.training.find((item) => item.id === id);
    if (module && !module.completedAt) {
      module.completedAt = new Date().toISOString();
    }
  },
};
