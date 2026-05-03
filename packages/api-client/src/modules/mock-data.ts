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

function daysAgo(days: number, hour = 20): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// === Active draws ===

export const MOCK_ACTIVE_DRAWS: DrawPublic[] = [
  {
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    status: 'ACTIVE',
    prizeDescription: 'Samsung Galaxy A55 5G',
    prizeValueNgn: 420000,
    prizeImageUrl: null,
    ticketPriceNgn: 500,
    scheduledAt: inHours(8),
    cutoffAt: inHours(7),
  },
  {
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    status: 'ACTIVE',
    prizeDescription: 'Saturday ₦4M jackpot',
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
    ticketsSold: 3284,
    prizePoolNgn: 821000,
    jackpotEligible: false,
  },
  'RD-DRAW-20260502-JACKPOT': {
    draw: MOCK_ACTIVE_DRAWS[1],
    ticketsSold: 812,
    prizePoolNgn: 4000000,
    jackpotEligible: true,
  },
};

// === Past results (public archive) ===

export const MOCK_PAST_RESULTS: DrawResultPublic[] = [
  {
    drawCode: 'RD-DRAW-20260430-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Hisense 55" U7 TV',
    prizeValueNgn: 540000,
    totalTicketsSold: 5841,
    winnerTicketRef: 'SW-04AB-9LK2',
    rngSeedHash: '9f4c2b8e1a7d6f30',
    stateBreakdown: { LAG: 1842, FCT: 921, KAN: 645, RIV: 421, OYO: 387, OGU: 312 },
    executedAt: daysAgo(2),
  },
  {
    drawCode: 'RD-DRAW-20260429-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'LG 1.5HP Inverter AC',
    prizeValueNgn: 480000,
    totalTicketsSold: 4902,
    winnerTicketRef: 'SW-9PQ8-ZK01',
    rngSeedHash: '3a7d1f4c8b2e9a1d',
    stateBreakdown: { LAG: 1521, FCT: 743, KAN: 512, RIV: 389, OYO: 298 },
    executedAt: daysAgo(3),
  },
  {
    drawCode: 'RD-DRAW-20260428-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'iPhone 14 (refurb cert.)',
    prizeValueNgn: 720000,
    totalTicketsSold: 5118,
    winnerTicketRef: 'SW-6FG2-HJN3',
    rngSeedHash: 'b2e8c4a1d7f30c9e',
    stateBreakdown: { LAG: 1689, FCT: 832, KAN: 521, RIV: 412, OYO: 341 },
    executedAt: daysAgo(4),
  },
  {
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Bosch washing machine',
    prizeValueNgn: 380000,
    totalTicketsSold: 4560,
    winnerTicketRef: 'SW-2A4B-N7P1',
    rngSeedHash: '7d9c3b2e8a1f4d6c',
    stateBreakdown: { LAG: 1432, FCT: 678, KAN: 489, RIV: 356, OYO: 312 },
    executedAt: daysAgo(5),
  },
  {
    drawCode: 'RD-DRAW-20260426-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: '₦4,000,000 cash',
    prizeValueNgn: 4000000,
    totalTicketsSold: 12408,
    winnerTicketRef: 'SW-7K39-X2QP',
    rngSeedHash: 'c5e9b214d6f3a7c1',
    stateBreakdown: {
      LAG: 4123,
      FCT: 1987,
      KAN: 1245,
      RIV: 892,
      OYO: 743,
      OGU: 612,
      KAD: 521,
      ENU: 432,
    },
    executedAt: daysAgo(6, 21),
  },
  {
    drawCode: 'RD-DRAW-20260425-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Samsung Galaxy A55',
    prizeValueNgn: 420000,
    totalTicketsSold: 5294,
    winnerTicketRef: 'SW-1M2N-44TR',
    rngSeedHash: '4a6d4f7c9b2e8a1d',
    stateBreakdown: { LAG: 1734, FCT: 821, KAN: 543, RIV: 412, OYO: 354 },
    executedAt: daysAgo(7),
  },
  {
    drawCode: 'RD-DRAW-20260424-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Hisense smart fridge',
    prizeValueNgn: 350000,
    totalTicketsSold: 4701,
    winnerTicketRef: 'SW-8X3C-MQ02',
    rngSeedHash: '1b5d8f2c4e9a7d6c',
    stateBreakdown: { LAG: 1523, FCT: 712, KAN: 489, RIV: 367, OYO: 298 },
    executedAt: daysAgo(8),
  },
  {
    drawCode: 'RD-DRAW-20260423-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'iPhone 14 (refurb cert.)',
    prizeValueNgn: 720000,
    totalTicketsSold: 5402,
    winnerTicketRef: 'SW-6FG2-HJN3',
    rngSeedHash: '6e9a4b7d1c2f8e0a',
    stateBreakdown: { LAG: 1789, FCT: 845, KAN: 567, RIV: 421, OYO: 367 },
    executedAt: daysAgo(9),
  },
  {
    drawCode: 'RD-DRAW-20260422-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Sony PlayStation 5',
    prizeValueNgn: 650000,
    totalTicketsSold: 5012,
    winnerTicketRef: 'SW-3E7H-PQ12',
    rngSeedHash: '2c8d4e9f1a7b6c3d',
    stateBreakdown: { LAG: 1645, FCT: 789, KAN: 521, RIV: 398, OYO: 334 },
    executedAt: daysAgo(10),
  },
  {
    drawCode: 'RD-DRAW-20260419-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: '₦4,000,000 cash',
    prizeValueNgn: 4000000,
    totalTicketsSold: 11892,
    winnerTicketRef: 'SW-9D4F-RT88',
    rngSeedHash: '8f2a1c5d3e7b9d4c',
    stateBreakdown: {
      LAG: 3987,
      FCT: 1834,
      KAN: 1198,
      RIV: 867,
      OYO: 712,
      OGU: 589,
      KAD: 498,
    },
    executedAt: daysAgo(13, 21),
  },
];

export const MOCK_RESULT_DETAIL: Record<string, GetResultDetailResponse> = Object.fromEntries(
  MOCK_PAST_RESULTS.map((r) => [
    r.drawCode,
    {
      result: r,
      drawDescription: r.prizeDescription,
      prizeImageUrl: null,
    },
  ]),
);

// === Recent stats (home page) ===

export const MOCK_RECENT_STATS: RecentStatsResponse = {
  recentWinners: [
    {
      drawDate: daysAgo(2),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 540000,
      prizeDescription: 'Hisense 55" U7 TV',
      winnerStateCode: 'LAG',
      winnerTicketRef: 'SW-04AB-9LK2',
    },
    {
      drawDate: daysAgo(6, 21),
      drawType: 'SATURDAY_JACKPOT',
      prizeValueNgn: 4000000,
      prizeDescription: '₦4,000,000 cash',
      winnerStateCode: 'FCT',
      winnerTicketRef: 'SW-7K39-X2QP',
    },
    {
      drawDate: daysAgo(7),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 420000,
      prizeDescription: 'Samsung Galaxy A55',
      winnerStateCode: 'LAG',
      winnerTicketRef: 'SW-1M2N-44TR',
    },
    {
      drawDate: daysAgo(8),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 480000,
      prizeDescription: 'LG 1.5HP Inverter AC',
      winnerStateCode: 'KAN',
      winnerTicketRef: 'SW-9PQ8-ZK01',
    },
    {
      drawDate: daysAgo(9),
      drawType: 'DAILY_STANDARD',
      prizeValueNgn: 720000,
      prizeDescription: 'iPhone 14 (refurb cert.)',
      winnerStateCode: 'RIV',
      winnerTicketRef: 'SW-6FG2-HJN3',
    },
  ],
  totalWinnersAllTime: 247,
  totalPrizesPaidNgn: 86420000,
};

// === Ticket lookup ===

export const MOCK_TICKET_BY_REF: Record<string, LookupTicketResponse> = {
  'SW-04AB-9LK2': {
    ticket: {
      ticketRef: 'SW-04AB-9LK2',
      drawCode: 'RD-DRAW-20260430-DAILY',
      ticketType: 'STANDARD',
      faceValueNgn: 500,
      stateOfPlayCode: 'LAG',
      status: 'WINNING',
      isWinner: true,
      createdAt: daysAgo(3),
    },
    isWinner: true,
    claimUrl: '/claim/mock-claim-id',
  },
  'SW-04AB-9LK3': {
    ticket: {
      ticketRef: 'SW-04AB-9LK3',
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
  'SW-7K39-X2QP': {
    ticket: {
      ticketRef: 'SW-7K39-X2QP',
      drawCode: 'RD-DRAW-20260426-JACKPOT',
      ticketType: 'JACKPOT',
      faceValueNgn: 5000,
      stateOfPlayCode: 'FCT',
      status: 'WINNING',
      isWinner: true,
      createdAt: daysAgo(7),
    },
    isWinner: true,
    claimUrl: '/claim/mock-claim-id-jackpot',
  },
};