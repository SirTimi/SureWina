import type {
  DashboardClaim,
  DashboardTicket,
  DrawPublic,
  DrawResultPublic,
  GetDrawResponse,
  GetResultDetailResponse,
  LookupTicketResponse,
  RecentStatsResponse,
  UserMe,
  ClaimKycStatus,
  ClaimPath,
  ClaimStatusEvent,
  CollectionPoint,
  GetClaimStatusResponse,
  LiveDrawState,
  WinnerNotification,
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

function daysFromNow(days: number, hour = 20): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// === Active draws ===

export const MOCK_ACTIVE_DRAWS: DrawPublic[] = [
  // Today's daily — closes in ~7 hours
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
  // Tomorrow's daily — Hisense U7 TV
  {
    drawCode: 'RD-DRAW-20260428-DAILY',
    drawType: 'DAILY_STANDARD',
    status: 'ACTIVE',
    prizeDescription: 'Hisense 55" U7 TV',
    prizeValueNgn: 540000,
    prizeImageUrl: null,
    ticketPriceNgn: 500,
    scheduledAt: inHours(32),
    cutoffAt: inHours(31),
  },
  // Day-after — LG OLED
  {
    drawCode: 'RD-DRAW-20260429-DAILY',
    drawType: 'DAILY_STANDARD',
    status: 'ACTIVE',
    prizeDescription: 'LG OLED 65" TV',
    prizeValueNgn: 1100000,
    prizeImageUrl: null,
    ticketPriceNgn: 500,
    scheduledAt: inHours(56),
    cutoffAt: inHours(55),
  },
  // 3 days out — iPhone
  {
    drawCode: 'RD-DRAW-20260430-DAILY',
    drawType: 'DAILY_STANDARD',
    status: 'ACTIVE',
    prizeDescription: 'iPhone 15',
    prizeValueNgn: 950000,
    prizeImageUrl: null,
    ticketPriceNgn: 500,
    scheduledAt: inHours(80),
    cutoffAt: inHours(79),
  },
  // Saturday jackpot
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
  'RD-DRAW-20260428-DAILY': {
    draw: MOCK_ACTIVE_DRAWS[1],
    ticketsSold: 1042,
    prizePoolNgn: 260500,
    jackpotEligible: false,
  },
  'RD-DRAW-20260429-DAILY': {
    draw: MOCK_ACTIVE_DRAWS[2],
    ticketsSold: 412,
    prizePoolNgn: 103000,
    jackpotEligible: false,
  },
  'RD-DRAW-20260430-DAILY': {
    draw: MOCK_ACTIVE_DRAWS[3],
    ticketsSold: 218,
    prizePoolNgn: 54500,
    jackpotEligible: false,
  },
  'RD-DRAW-20260502-JACKPOT': {
    draw: MOCK_ACTIVE_DRAWS[4],
    ticketsSold: 812,
    prizePoolNgn: 4000000,
    jackpotEligible: true,
  },
};

// === Past results ===

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
    stateBreakdown: { LAG: 4123, FCT: 1987, KAN: 1245, RIV: 892, OYO: 743, OGU: 612, KAD: 521, ENU: 432 },
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
    stateBreakdown: { LAG: 3987, FCT: 1834, KAN: 1198, RIV: 867, OYO: 712, OGU: 589, KAD: 498 },
    executedAt: daysAgo(13, 21),
  },
];

export const MOCK_RESULT_DETAIL: Record<string, GetResultDetailResponse> = Object.fromEntries(
  MOCK_PAST_RESULTS.map((r) => [
    r.drawCode,
    { result: r, drawDescription: r.prizeDescription, prizeImageUrl: null },
  ]),
);

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

// === Dashboard mock user + portfolio ===

export const MOCK_USER_ME: UserMe = {
  userId: 'usr_chidi_mock_demo_user_id_001',
  phoneNumber: '+2348034129018',
  email: null,
  displayName: null,
  kycStatus: 'OTP_VERIFIED',
  loyaltyPointsBalance: 245,
  notificationPreferences: {
    sms: true,
    push: true,
    email: false,
  },
  bankAccount: null,
  spendLimit: {
    period: 'MONTHLY',
    capNgn: 20000,
  },
  selfExclusionUntil: null,
  createdAt: daysAgo(45),
};

export const MOCK_DASHBOARD_TICKETS: DashboardTicket[] = [
  // 14 active tickets across 3 upcoming draws
  // Draw 1: Today's Galaxy A55 daily (2 tickets)
  {
    ticketRef: 'SW-04AB-9LK2',
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'Samsung Galaxy A55 5G',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(0),
    awaitingDraw: true,
    createdAt: daysAgo(0),
  },
  {
    ticketRef: 'SW-04AB-9LK3',
    drawCode: 'RD-DRAW-20260427-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'Samsung Galaxy A55 5G',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(0),
    awaitingDraw: true,
    createdAt: daysAgo(0),
  },
  // Draw 2: Saturday jackpot (1 jackpot ticket)
  {
    ticketRef: 'SW-7K39-X2QP',
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    drawPrizeDescription: 'Saturday ₦4M jackpot',
    ticketType: 'JACKPOT',
    faceValueNgn: 5000,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(4, 21),
    awaitingDraw: true,
    createdAt: daysAgo(1),
  },
  // Draw 3: Tomorrow's Hisense U7 TV daily (3 tickets)
  ...Array.from({ length: 3 }, (_, i): DashboardTicket => ({
    ticketRef: `SW-1M2N-44T${'RST'[i]}`,
    drawCode: 'RD-DRAW-20260428-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'Hisense 55" U7 TV',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(1),
    awaitingDraw: true,
    createdAt: daysAgo(0),
  })),
  // Draw 4: Day-after-tomorrow daily (4 tickets)
  ...Array.from({ length: 4 }, (_, i): DashboardTicket => ({
    ticketRef: `SW-PQ${i + 1}R-T${i + 5}M9`,
    drawCode: 'RD-DRAW-20260429-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'LG OLED 65" TV',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(2),
    awaitingDraw: true,
    createdAt: daysAgo(1),
  })),
  // Draw 5: 3 days from now daily (4 tickets)
  ...Array.from({ length: 4 }, (_, i): DashboardTicket => ({
    ticketRef: `SW-XY${i + 8}Z-A${i + 1}B5`,
    drawCode: 'RD-DRAW-20260430-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'iPhone 15',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'ACTIVE',
    isWinner: false,
    drawScheduledAt: daysFromNow(3),
    awaitingDraw: true,
    createdAt: daysAgo(2),
  })),
  // === Past tickets (28 total) ===
  // Past winning ticket — converted to claim
  {
    ticketRef: 'SW-WIN1-A2B3',
    drawCode: 'RD-DRAW-20260330-DAILY',
    drawType: 'DAILY_STANDARD',
    drawPrizeDescription: 'Samsung Galaxy A55',
    ticketType: 'STANDARD',
    faceValueNgn: 500,
    stateOfPlayCode: 'LAG',
    status: 'WINNING',
    isWinner: true,
    drawScheduledAt: daysAgo(33),
    awaitingDraw: false,
    createdAt: daysAgo(34),
  },
  // 27 past non-winning tickets across various past draws
  ...Array.from({ length: 27 }, (_, i): DashboardTicket => {
    const daysBack = 5 + Math.floor(i / 2);
    const drawDate = new Date();
    drawDate.setDate(drawDate.getDate() - daysBack);
    const yyyymmdd = `${drawDate.getFullYear()}${String(drawDate.getMonth() + 1).padStart(2, '0')}${String(drawDate.getDate()).padStart(2, '0')}`;
    return {
      ticketRef: `SW-P${String(i).padStart(2, '0')}T-${'AB'[i % 2]}${'CD'[i % 2]}${(i + 1).toString().slice(-2).padStart(2, '0')}`,
      drawCode: `RD-DRAW-${yyyymmdd}-DAILY`,
      drawType: 'DAILY_STANDARD',
      drawPrizeDescription: ['LG TV', 'iPhone 14', 'Bosch washer', 'Hisense fridge', 'Galaxy A55'][i % 5],
      ticketType: 'STANDARD',
      faceValueNgn: 500,
      stateOfPlayCode: 'LAG',
      status: 'EXPIRED',
      isWinner: false,
      drawScheduledAt: daysAgo(daysBack),
      awaitingDraw: false,
      createdAt: daysAgo(daysBack + 1),
    };
  }),
];

export const MOCK_DASHBOARD_CLAIMS: DashboardClaim[] = [
  {
    claimId: 'clm_mock_001',
    drawCode: 'RD-DRAW-20260330-DAILY',
    drawType: 'DAILY_STANDARD',
    prizeDescription: 'Samsung Galaxy A55',
    ticketRef: 'SW-WIN1-A2B3',
    grossPrizeValueNgn: 420000,
    netPrizeValueNgn: 420000,
    whtAmountNgn: 0,
    claimType: 'PRODUCT',
    status: 'DELIVERED',
    selectionDeadlineAt: daysAgo(26),
    claimDeadlineAt: daysAgo(3),
    fulfilledAt: daysAgo(20),
    drawDate: daysAgo(33),
  },
];

// === Winner notification mock ===

export const MOCK_WINNER_NOTIFICATION: WinnerNotification = {
  claimId: 'clm_demo_winner_001',
  ticketRef: 'SW-04AB-9LK2',
  drawCode: 'RD-DRAW-20260427-DAILY',
  drawType: 'DAILY_STANDARD',
  prizeDescription: 'Samsung Galaxy A55 5G',
  prizeImageUrl: '/images/draw-phone.webp',
  grossPrizeValueNgn: 420000,
  drawnAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  seedHash: '9f4c2b8e1a7d6f30c5e9b2148a6d4f7c2c6e9a4b7d0f3e6c1a5b8d',
  seedReveal: '4a1f7c8d2e9b0a5f6c1d3e4b7a9c2d8e5f0a1b6c3d7e4f9a2b8c5',
  selectionDeadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  buyerPhoneLast4: '9018',
};

export const MOCK_WINNER_BY_CLAIM: Record<string, WinnerNotification> = {
  clm_demo_winner_001: MOCK_WINNER_NOTIFICATION,
  clm_demo_winner_jackpot: {
    ...MOCK_WINNER_NOTIFICATION,
    claimId: 'clm_demo_winner_jackpot',
    ticketRef: 'SW-7K39-X2QP',
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    drawType: 'SATURDAY_JACKPOT',
    prizeDescription: 'Saturday ₦4M Jackpot',
    prizeImageUrl: '/images/jackpot-cash.webp',
    grossPrizeValueNgn: 4000000,
  },
};

// === Live draw mock ===

let liveDrawTickStartedAt = Date.now();

export function getMockLiveDrawState(drawCode: string): LiveDrawState {
  const isJackpot = drawCode.includes('JACKPOT');

  // Phase advances based on time since module load — keeps the "drawing" animation honest
  const elapsed = Date.now() - liveDrawTickStartedAt;
  let phase: LiveDrawState['phase'];
  if (elapsed < 12_000) phase = 'PRE_DRAW';
  else if (elapsed < 20_000) phase = 'DRAWING';
  else phase = 'COMPLETE';

  return {
    drawCode,
    drawType: isJackpot ? 'SATURDAY_JACKPOT' : 'DAILY_STANDARD',
    prizeDescription: isJackpot ? 'Saturday ₦4M Jackpot' : 'Samsung Galaxy A55 5G',
    prizeValueNgn: isJackpot ? 4_000_000 : 420_000,
    scheduledAt: new Date(liveDrawTickStartedAt).toISOString(),
    ticketsSold: isJackpot ? 12_408 : 5_841,
    seedHash: '9f4c2b8e1a7d6f30c5e9b2148a6d4f7c2c6e9a4b7d0f3e6c1a5b8d',
    phase,
    winningTicketRef: phase === 'COMPLETE' ? 'SW-04AB-9LK2' : null,
    seedReveal:
      phase === 'COMPLETE'
        ? '4a1f7c8d2e9b0a5f6c1d3e4b7a9c2d8e5f0a1b6c3d7e4f9a2b8c5'
        : null,
  };
}

export function resetMockLiveDraw(): void {
  liveDrawTickStartedAt = Date.now();
}

// === Claim path mock ===

const mockClaims: Record<string, ClaimPath> = {
  clm_demo_winner_001: {
    claimId: 'clm_demo_winner_001',
    ticketRef: 'SW-04AB-9LK2',
    drawCode: 'RD-DRAW-20260427-DAILY',
    prizeDescription: 'Samsung Galaxy A55 5G',
    grossPrizeValueNgn: 420_000,
    estimatedWhtNgn: 42_000,
    netCashIfChosenNgn: 378_000,
    selectionMade: false,
    selectedPath: null,
    selectionDeadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    changeWindowEndsAt: null,
    isJackpot: false,
  },
  clm_demo_winner_jackpot: {
    claimId: 'clm_demo_winner_jackpot',
    ticketRef: 'SW-7K39-X2QP',
    drawCode: 'RD-DRAW-20260502-JACKPOT',
    prizeDescription: 'Saturday ₦4M Jackpot',
    grossPrizeValueNgn: 4_000_000,
    estimatedWhtNgn: 400_000,
    netCashIfChosenNgn: 3_600_000,
    selectionMade: false,
    selectedPath: null,
    selectionDeadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    changeWindowEndsAt: null,
    isJackpot: true,
  },
};

export function getMockClaim(claimId: string): ClaimPath | undefined {
  return mockClaims[claimId];
}

export function setMockClaimSelection(
  claimId: string,
  path: 'PRODUCT' | 'CASH',
): ClaimPath | undefined {
  const c = mockClaims[claimId];
  if (!c) return undefined;
  c.selectionMade = true;
  c.selectedPath = path;
  c.changeWindowEndsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  return c;
}

// === Collection points mock ===

export const MOCK_COLLECTION_POINTS: CollectionPoint[] = [
  {
    id: 'cp_lekki_phase_1',
    name: 'Surewina Collection Centre, Lekki Phase 1',
    address: '12B Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    stateCode: 'LAG',
    openingHours: 'Mon–Sat · 09:00–17:00',
  },
  {
    id: 'cp_ikeja',
    name: 'Surewina Collection Centre, Ikeja',
    address: '34 Mobolaji Bank Anthony Way, Ikeja GRA',
    city: 'Lagos',
    stateCode: 'LAG',
    openingHours: 'Mon–Sat · 09:00–17:00',
  },
  {
    id: 'cp_abuja_wuse',
    name: 'Surewina Collection Centre, Wuse 2',
    address: 'Plot 1234, Adetokunbo Ademola Crescent, Wuse 2',
    city: 'Abuja',
    stateCode: 'FCT',
    openingHours: 'Mon–Fri · 09:00–17:00',
  },
  {
    id: 'cp_ph_gra',
    name: 'Surewina Collection Centre, Port Harcourt',
    address: '17 Aba Road, GRA Phase II',
    city: 'Port Harcourt',
    stateCode: 'RIV',
    openingHours: 'Mon–Sat · 09:00–17:00',
  },
  {
    id: 'cp_kano',
    name: 'Surewina Collection Centre, Kano',
    address: '8 Bompai Road, Nasarawa GRA',
    city: 'Kano',
    stateCode: 'KAN',
    openingHours: 'Mon–Sat · 09:00–17:00',
  },
  {
    id: 'cp_ibadan',
    name: 'Surewina Collection Centre, Ibadan',
    address: '21 Awolowo Avenue, Bodija',
    city: 'Ibadan',
    stateCode: 'OYO',
    openingHours: 'Mon–Sat · 09:00–17:00',
  },
];

// === KYC status mock ===

const mockKycByClaimId: Record<string, ClaimKycStatus> = {};

export function getMockKyc(claimId: string): ClaimKycStatus {
  if (!mockKycByClaimId[claimId]) {
    mockKycByClaimId[claimId] = {
      claimId,
      status: 'NOT_STARTED',
      rejectionReason: null,
      bvnLast4: null,
      bankAccount: null,
      documentUploaded: false,
      selfieUploaded: false,
      kycDeadlineAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return mockKycByClaimId[claimId];
}

export function setMockKyc(claimId: string, patch: Partial<ClaimKycStatus>): ClaimKycStatus {
  const current = getMockKyc(claimId);
  Object.assign(current, patch);
  return current;
}

// === Claim status (timeline) mock ===

export function getMockClaimStatus(claimId: string): GetClaimStatusResponse {
  const claim = mockClaims[claimId];
  const kyc = mockKycByClaimId[claimId];

  // Build timeline based on selected path + kyc state
  const events: ClaimStatusEvent[] = [
    {
      id: 'won',
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      label: 'Ticket won the draw',
      description: claim
        ? `${claim.ticketRef} matched the winning index`
        : 'Your ticket matched the winning index',
      iconKey: 'trophy',
      state: 'done',
    },
    {
      id: 'notified',
      timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      label: 'You were notified',
      description: 'SMS sent to verify the win',
      iconKey: 'check',
      state: 'done',
    },
  ];

  if (claim?.selectionMade) {
    events.push({
      id: 'selection',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      label:
        claim.selectedPath === 'CASH' ? 'You chose cash' : 'You chose product fulfilment',
      description:
        claim.selectedPath === 'CASH'
          ? 'KYC required before payout'
          : 'Collection booking next',
      iconKey: claim.selectedPath === 'CASH' ? 'banknote' : 'package',
      state: 'done',
    });

    if (claim.selectedPath === 'CASH') {
      const kycComplete = kyc?.status === 'COMPLETE';
      events.push({
        id: 'kyc',
        timestamp: kycComplete
          ? new Date(Date.now() - 1000 * 60 * 10).toISOString()
          : new Date().toISOString(),
        label: kycComplete ? 'KYC verified' : 'KYC in progress',
        description: kycComplete
          ? 'NIN, BVN and bank account confirmed'
          : 'Upload ID, verify BVN, link bank account',
        iconKey: 'shield',
        state: kycComplete ? 'done' : 'current',
      });

      events.push({
        id: 'payout',
        timestamp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        label: 'Bank transfer',
        description: 'Net amount paid after WHT deduction',
        iconKey: 'banknote',
        state: kycComplete ? 'current' : 'future',
      });
    } else {
      events.push({
        id: 'booking',
        timestamp: new Date().toISOString(),
        label: 'Collection booking',
        description: 'Choose a collection centre and date',
        iconKey: 'package',
        state: 'current',
      });

      events.push({
        id: 'pickup',
        timestamp: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
        label: 'Prize collected',
        description: 'Bring valid ID + the SMS receipt',
        iconKey: 'home',
        state: 'future',
      });
    }
  } else {
    events.push({
      id: 'select',
      timestamp: new Date().toISOString(),
      label: 'Choose product or cash',
      description: 'You have until the selection deadline to decide',
      iconKey: 'clock',
      state: 'current',
    });
  }

  return {
    claimId,
    prizeDescription: claim?.prizeDescription ?? 'Prize',
    selectedPath: claim?.selectedPath ?? null,
    currentStatus: claim?.selectionMade
      ? claim.selectedPath === 'CASH'
        ? mockKycByClaimId[claimId]?.status === 'COMPLETE'
          ? 'Awaiting bank transfer'
          : 'KYC in progress'
        : 'Awaiting collection booking'
      : 'Awaiting your selection',
    events,
    estimatedCompletionAt: claim?.selectedPath === 'CASH'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };
}