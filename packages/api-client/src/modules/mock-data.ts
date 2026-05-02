import type {
  DrawPublic,
  DrawResultPublic,
  GetDrawResponse,
  GetResultDetailResponse,
  LookupTicketResponse,
  RecentStatsResponse,
} from '@surewina/types';

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const MOCK_ACTIVE_DRAWS: DrawPublic[] = [
  {
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    status: 'ACTIVE',
    prizeDescription: 'Samsung Galaxy A55 5G — 256GB',
    prizeValueNgn: 450000,
    prizeImageUrl: null,
    ticketPriceNgn: 500,
    scheduledAt: inHours(8),
    cutoffAt: inHours(7),
  },
  {
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    status: 'ACTIVE',
    prizeDescription: 'Saturday Jackpot — ₦4,000,000 cash',
    prizeValueNgn: 4000000,
    prizeImageUrl: null,
    ticketPriceNgn: 5000,
    scheduledAt: inHours(120),
    cutoffAt: inHours(119),
  },
];

export const MOCK_DRAW_BY_ID: Record<string, GetDrawResponse> = {
  'RD-DRAW-20260427-DAILY': {
    draw: MOCK_ACTIVE_DRAWS[0],
    ticketsSold: 1247,
    prizePoolNgn: 311750,
    jackpotEligible: false,
  },
  'RD-DRAW-20260502-JACKPOT': {
    draw: MOCK_ACTIVE_DRAWS[1],
    ticketsSold: 423,
    prizePoolNgn: 4000000,
    jackpotEligible: true,
  },
};

export const MOCK_PAST_RESULTS: DrawResultPublic[] = [
  {
    drawCode: 'RD-DRAW-20260425-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: 'Saturday Jackpot — ₦4,000,000 cash',
    prizeValueNgn: 4000000,
    totalTicketsSold: 1832,
    winnerTicketRef: 'RD-20260425-001247',
    rngSeedHash: 'a3f9c8e2b1d4...',
    stateBreakdown: { LAG: 612, FCT: 290, KAN: 145, RIV: 98, OYO: 87, OGU: 76 },
    executedAt: daysAgo(2),
  },
  {
    drawCode: 'RD-DRAW-20260424-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'iPhone 15 — 128GB',
    prizeValueNgn: 980000,
    totalTicketsSold: 1456,
    winnerTicketRef: 'RD-20260424-000892',
    rngSeedHash: 'b2e8d7c1a3f5...',
    stateBreakdown: { LAG: 487, FCT: 234, KAN: 112, RIV: 89, OYO: 76 },
    executedAt: daysAgo(3),
  },
  {
    drawCode: 'RD-DRAW-20260423-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'LG 55-inch Smart TV',
    prizeValueNgn: 520000,
    totalTicketsSold: 1234,
    winnerTicketRef: 'RD-20260423-000456',
    rngSeedHash: 'c1d7e8f2a4b6...',
    stateBreakdown: { LAG: 423, FCT: 198, KAN: 87, RIV: 76, OYO: 65 },
    executedAt: daysAgo(4),
  },
  {
    drawCode: 'RD-DRAW-20260418-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: 'Saturday Jackpot — ₦4,000,000 cash',
    prizeValueNgn: 4000000,
    totalTicketsSold: 2145,
    winnerTicketRef: 'RD-20260418-001834',
    rngSeedHash: 'd4f8a1b3c5e7...',
    stateBreakdown: { LAG: 745, FCT: 356, KAN: 198, RIV: 134, OYO: 112 },
    executedAt: daysAgo(9),
  },
  {
    drawCode: 'RD-DRAW-20260417-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Hisense Refrigerator — 350L',
    prizeValueNgn: 380000,
    totalTicketsSold: 987,
    winnerTicketRef: 'RD-20260417-000234',
    rngSeedHash: 'e5a8b3c7d2f4...',
    stateBreakdown: { LAG: 312, FCT: 167, KAN: 89, RIV: 67 },
    executedAt: daysAgo(10),
  },
];

export const MOCK_RESULT_DETAIL: Record<string, GetResultDetailResponse> = {
  'RD-DRAW-20260425-JACKPOT': {
    result: MOCK_PAST_RESULTS[0],
    drawDescription: 'Saturday Jackpot — ₦4,000,000 cash',
    prizeImageUrl: null,
  },
  'RD-DRAW-20260424-DAILY': {
    result: MOCK_PAST_RESULTS[1],
    drawDescription: 'iPhone 15 — 128GB',
    prizeImageUrl: null,
  },
};

export const MOCK_RECENT_STATS: RecentStatsResponse = {
  recentWinners: [
    {
      drawDate: daysAgo(2),
      drawType: 'SATURDAY_JACKPOT',
      prizeValueNgn: 4000000,
      prizeDescription: '₦4M cash',
      winnerStateCode: 'LAG',
      winnerTicketRef: 'RD-20260425-001247',
    },
    {
      drawDate: daysAgo(3),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 980000,
      prizeDescription: 'iPhone 15',
      winnerStateCode: 'FCT',
      winnerTicketRef: 'RD-20260424-000892',
    },
    {
      drawDate: daysAgo(4),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 520000,
      prizeDescription: 'LG Smart TV',
      winnerStateCode: 'KAN',
      winnerTicketRef: 'RD-20260423-000456',
    },
  ],
  totalWinnersAllTime: 47,
  totalPrizesPaidNgn: 23450000,
};

export const MOCK_TICKET_BY_REF: Record<string, LookupTicketResponse> = {
  'RD-20260425-001247': {
    ticket: {
      ticketRef: 'RD-20260425-001247',
      drawCode: 'RD-DRAW-20260425-JACKPOT',
      ticketType: 'JACKPOT',
      faceValueNgn: 5000,
      stateOfPlayCode: 'LAG',
      status: 'WINNING',
      isWinner: true,
      createdAt: daysAgo(2),
    },
    isWinner: true,
    claimUrl: '/claim/mock-claim-id',
  },
  'RD-20260427-000123': {
    ticket: {
      ticketRef: 'RD-20260427-000123',
      drawCode: 'RD-DRAW-20260427-DAILY',
      ticketType: 'STANDARD',
      faceValueNgn: 500,
      stateOfPlayCode: 'LAG',
      status: 'ACTIVE',
      isWinner: false,
      createdAt: new Date().toISOString(),
    },
    isWinner: false,
    claimUrl: null,
  },
};