/**
 * Comprehensive admin mock store.
 *
 * Phase 5 ships the admin dashboard against mocked data. Everything lives in
 * memory and is seeded so every screen — draws, agents, claims, payouts,
 * reports — has realistic content for review. The real Postgres-backed
 * backend lands in Phase 6+.
 */

// ============================================================
// Entities
// ============================================================

export type DrawStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'EXECUTED'
  | 'CANCELLED';

export interface Draw {
  drawId: string;
  drawCode: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'SPECIAL';
  prizeDescription: string;
  prizeValueNgn: number;
  prizeImageUrl: string | null;
  ticketPriceNgn: number;
  ticketCap: number;
  ticketsSold: number;
  scheduledAt: string;
  cutoffAt: string;
  status: DrawStatus;
  rngSeedHashCommit: string | null;
  rngSeedReveal: string | null;
  winnerTicketRef: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AdminTicket {
  ticketRef: string;
  drawCode: string;
  customerPhoneE164: string;
  customerName: string | null;
  agentCode: string | null;
  amountNgn: number;
  channel: 'AGENT' | 'WEB' | 'USSD';
  status: 'ACTIVE' | 'WINNING' | 'EXPIRED' | 'VOIDED';
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED';
  createdAt: string;
}

export interface AdminCustomer {
  customerId: string;
  phoneE164: string;
  displayName: string | null;
  kycStatus: 'NONE' | 'OTP_VERIFIED' | 'TIER1_COMPLETE' | 'TIER2_COMPLETE';
  ticketCount: number;
  lifetimeSpendNgn: number;
  lifetimePrizeNgn: number;
  flagged: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Dispute {
  disputeId: string;
  ticketRef: string | null;
  customerPhoneE164: string;
  subject: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignedTo: string | null;
  messageCount: number;
  createdAt: string;
  lastUpdatedAt: string;
  thread: Array<{
    actor: 'CUSTOMER' | 'SUPPORT';
    by: string;
    body: string;
    at: string;
  }>;
}

export interface AdminAgent {
  agentId: string;
  agentCode: string;
  fullName: string;
  phoneE164: string;
  stateCode: string;
  status: 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  isSuperAgent: boolean;
  superAgentCode: string | null;
  monthlyTicketCount: number;
  monthlySalesNgn: number;
  remittanceCompliance: number; // 0-1
  remittanceOverdue: boolean;
  createdAt: string;
}

export interface AgentOnboarding {
  applicationId: string;
  fullName: string;
  phoneE164: string;
  stateCode: string;
  submittedAt: string;
  docsSubmitted: string[];
  bvnHashLastFour: string;
  status: 'IN_REVIEW' | 'AWAITING_DOCS' | 'APPROVED' | 'REJECTED';
  reviewer: string | null;
}

export type ClaimStage =
  | 'NOTIFIED'
  | 'SELECTED'
  | 'KYC'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'FORFEITED';

export interface Claim {
  claimId: string;
  ticketRef: string;
  drawCode: string;
  prizeDescription: string;
  prizeValueNgn: number;
  winnerPhoneE164: string;
  winnerName: string | null;
  stage: ClaimStage;
  pathSelected: 'PRODUCT' | 'CASH' | null;
  notifiedAt: string;
  selectedAt: string | null;
  kycCompletedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  forfeitsAt: string;
  contactAttempts: number;
  notes: string | null;
}

export interface KycCase {
  kycCaseId: string;
  customerPhoneE164: string;
  claimId: string | null;
  level: 'TIER1' | 'TIER2';
  status: 'IN_REVIEW' | 'PASSED' | 'REJECTED' | 'AWAITING_DOCS';
  submittedAt: string;
  docs: Array<{ label: string; uploadedAt: string }>;
  reviewer: string | null;
  flags: string[];
}

export interface Payout {
  payoutId: string;
  claimId: string;
  ticketRef: string;
  customerPhoneE164: string;
  customerName: string;
  amountNgn: number;
  whtNgn: number;
  netNgn: number;
  status: 'AWAITING_APPROVAL' | 'APPROVED' | 'PAID' | 'BLOCKED';
  paymentMethod: 'BANK_TRANSFER' | 'CASH' | null;
  bankReference: string | null;
  whtCertificateNo: string | null;
  createdAt: string;
}

export interface RemittanceRecord {
  remittanceId: string;
  agentCode: string;
  agentName: string;
  date: string;
  owedNgn: number;
  paidNgn: number;
  status: 'PAID' | 'PENDING' | 'LATE' | 'OVERDUE';
  receiptRef: string | null;
}

export interface CommissionLedgerEntry {
  entryId: string;
  agentCode: string;
  agentName: string;
  date: string;
  basisNgn: number;
  rate: number;
  commissionNgn: number;
  overrideNgn: number;
  status: 'ACCRUED' | 'DISBURSED' | 'HELD';
}

export interface JackpotMovement {
  movementId: string;
  at: string;
  type: 'CONTRIBUTION' | 'PAYOUT' | 'ROLLOVER';
  amountNgn: number;
  drawCode: string | null;
  note: string;
}

export interface AuditLogEntry {
  logId: string;
  at: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
}

export interface RngSeed {
  seedId: string;
  drawCode: string;
  commitHash: string;
  revealedSeed: string | null;
  committedAt: string;
  revealedAt: string | null;
  status: 'COMMITTED' | 'REVEALED' | 'VOID';
}

export interface NotificationTemplate {
  templateId: string;
  channel: 'SMS' | 'PUSH' | 'EMAIL';
  name: string;
  subject: string | null;
  body: string;
  lastUpdatedAt: string;
}

export interface PromoCampaign {
  campaignId: string;
  name: string;
  code: string;
  type: 'PERCENTAGE_OFF' | 'FLAT_OFF' | 'BONUS_ENTRIES';
  value: number;
  redemptions: number;
  cap: number;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
}

export interface AdminUserRow {
  adminUserId: string;
  fullName: string;
  email: string;
  role: 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
}

export interface AmlFlag {
  flagId: string;
  customerPhoneE164: string;
  rule: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  detail: string;
  status: 'OPEN' | 'CLEARED' | 'ESCALATED_NFIU';
  raisedAt: string;
}

export interface FailedPayment {
  paymentId: string;
  at: string;
  customerPhoneE164: string;
  amountNgn: number;
  channel: 'CARD' | 'TRANSFER' | 'USSD' | 'OPAY';
  reason: string;
}

// ============================================================
// Helpers
// ============================================================

function iso(offsetMinutes: number): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}
function isoDays(d: number): string {
  return iso(d * 24 * 60);
}
function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

const STATES = ['LAG', 'FCT', 'KAN', 'RIV', 'OYO', 'ANA', 'OGU', 'KAD'] as const;
const FIRST = ['Tunde', 'Adaeze', 'Emeka', 'Sade', 'Kunle', 'Chidi', 'Ngozi', 'Bola', 'Funmi', 'Yusuf', 'Aisha', 'Femi'];
const LAST = ['Okonkwo', 'Adekunle', 'Bello', 'Nwosu', 'Adeyemi', 'Bakare', 'Ibrahim', 'Lawal', 'Eze', 'Ojo'];

function name(i: number) {
  return `${pick(FIRST, i)} ${pick(LAST, i + 3)}`;
}
function phone(i: number) {
  const suf = String(10_000_000 + (i * 137) % 90_000_000).padStart(8, '0');
  return `+23480${suf.slice(0, 8)}`;
}
function ticketRef(i: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (n: number) => Array.from({ length: 4 }, (_, k) =>
    chars[(i * (n + 7) + k * 13) % chars.length],
  ).join('');
  return `SW-${part(1)}-${part(2)}`;
}

// ============================================================
// Seeded data
// ============================================================

const draws: Draw[] = (() => {
  const arr: Draw[] = [];
  for (let i = -7; i <= 14; i++) {
    const isToday = i === 0;
    const isPast = i < 0;
    const isJackpot = (i + 14) % 7 === 6;
    const prizeOptions = [
      { d: 'Samsung Galaxy A55 5G', v: 420_000 },
      { d: 'Hisense 55" U7 TV', v: 540_000 },
      { d: 'LG OLED 65" TV', v: 1_100_000 },
      { d: 'iPhone 15', v: 950_000 },
      { d: 'Bajaj Boxer motorbike', v: 880_000 },
    ];
    const prize = isJackpot
      ? { d: 'Saturday ₦4M jackpot', v: 4_000_000 }
      : pick(prizeOptions, i + 7);
    const drawCode = `RD-DRAW-${new Date(Date.now() + i * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}-${isJackpot ? 'JACKPOT' : 'DAILY'}`;
    arr.push({
      drawId: `drw_${i + 100}`,
      drawCode,
      drawType: isJackpot ? 'SATURDAY_JACKPOT' : 'DAILY_STANDARD',
      prizeDescription: prize.d,
      prizeValueNgn: prize.v,
      prizeImageUrl: null,
      ticketPriceNgn: isJackpot ? 5000 : 500,
      ticketCap: isJackpot ? 20_000 : 10_000,
      ticketsSold: isPast
        ? Math.floor((isJackpot ? 18_000 : 5_800) - i * 220)
        : isToday
          ? 3284
          : Math.floor(800 + (i * 137) % 2200),
      scheduledAt: new Date(Date.now() + i * 86_400_000 + 20 * 60 * 60_000).toISOString(),
      cutoffAt: new Date(Date.now() + i * 86_400_000 + 19 * 60 * 60_000).toISOString(),
      status: isPast ? 'EXECUTED' : isToday ? 'OPEN' : i === 1 ? 'SCHEDULED' : 'SCHEDULED',
      rngSeedHashCommit: isPast || isToday ? `9f4c2b8e1a${(i + 9).toString(16)}d6f30` : null,
      rngSeedReveal: isPast
        ? `seed_${Math.abs(i)}_revealed_${(i + 100).toString(16)}`
        : null,
      winnerTicketRef: isPast ? ticketRef(i + 100) : null,
      createdBy: 'tunde.adekunle@surewina.ng',
      createdAt: new Date(Date.now() + (i - 2) * 86_400_000).toISOString(),
    });
  }
  return arr;
})();

const tickets: AdminTicket[] = Array.from({ length: 64 }).map((_, i) => {
  const draw = pick(draws, i);
  const status: AdminTicket['status'] = i % 19 === 0 ? 'WINNING' : i % 31 === 0 ? 'VOIDED' : 'ACTIVE';
  return {
    ticketRef: ticketRef(i),
    drawCode: draw.drawCode,
    customerPhoneE164: phone(i),
    customerName: i % 3 === 0 ? name(i) : null,
    agentCode: i % 4 === 0 ? `RD-AGT-${480_000 + (i * 37) % 9_000}` : null,
    amountNgn: draw.ticketPriceNgn,
    channel: pick(['AGENT', 'WEB', 'USSD'] as const, i),
    status,
    paymentStatus: i % 23 === 0 ? 'FAILED' : i % 17 === 0 ? 'PENDING' : 'PAID',
    createdAt: iso(-i * 15),
  };
});

const customers: AdminCustomer[] = Array.from({ length: 28 }).map((_, i) => ({
  customerId: `cus_${i.toString(36).padStart(4, '0')}`,
  phoneE164: phone(i * 3),
  displayName: i % 4 === 0 ? name(i) : null,
  kycStatus: pick(['NONE', 'OTP_VERIFIED', 'TIER1_COMPLETE', 'TIER2_COMPLETE'] as const, i),
  ticketCount: 1 + (i * 7) % 92,
  lifetimeSpendNgn: 500 * (1 + (i * 11) % 320),
  lifetimePrizeNgn: i % 11 === 0 ? 100_000 + i * 1000 : 0,
  flagged: i % 17 === 0,
  notes: i % 17 === 0 ? 'Customer requested transaction review on 12/03.' : null,
  createdAt: isoDays(-(i * 4 + 5)),
}));

const disputes: Dispute[] = Array.from({ length: 14 }).map((_, i) => ({
  disputeId: `dsp_${i.toString(36).padStart(4, '0')}`,
  ticketRef: i % 3 === 0 ? null : ticketRef(i),
  customerPhoneE164: phone(i * 5),
  subject: [
    'Did not receive winning notification',
    'Charged twice for ticket purchase',
    'Cannot find my ticket in dashboard',
    'Bank transfer never settled',
    'KYC documents rejected without reason',
  ][i % 5],
  status: pick(['OPEN', 'IN_REVIEW', 'IN_REVIEW', 'RESOLVED', 'OPEN'] as const, i),
  priority: pick(['MEDIUM', 'HIGH', 'LOW', 'MEDIUM'] as const, i),
  assignedTo: i % 2 === 0 ? 'sade.bello@surewina.ng' : null,
  messageCount: 2 + (i % 5),
  createdAt: isoDays(-i - 1),
  lastUpdatedAt: iso(-i * 90),
  thread: [
    {
      actor: 'CUSTOMER',
      by: phone(i * 5),
      body: 'Hello, I bought a ticket yesterday but it is not showing in my dashboard.',
      at: isoDays(-i - 1),
    },
    {
      actor: 'SUPPORT',
      by: 'sade.bello@surewina.ng',
      body: 'Thank you for reaching out. Can you share the ticket reference or the time of purchase?',
      at: iso(-i * 90 - 30),
    },
  ],
}));

const agents: AdminAgent[] = Array.from({ length: 22 }).map((_, i) => ({
  agentId: `agt_${i.toString(36).padStart(4, '0')}`,
  agentCode: `RD-AGT-${480_000 + i * 137}`,
  fullName: name(i + 4),
  phoneE164: phone(i * 7 + 3),
  stateCode: pick(STATES, i),
  status: pick(['ACTIVE', 'ACTIVE', 'ACTIVE', 'SUSPENDED', 'PENDING_KYC'] as const, i),
  tier: pick(['BRONZE', 'SILVER', 'GOLD'] as const, i),
  isSuperAgent: i % 7 === 0,
  superAgentCode: i % 7 === 0 ? null : i % 3 === 0 ? `RD-AGT-${480_000}` : null,
  monthlyTicketCount: 60 + ((i * 43) % 410),
  monthlySalesNgn: 30_000 + ((i * 11) % 380) * 1000,
  remittanceCompliance: Math.max(0.6, 1 - (i % 9) * 0.04),
  remittanceOverdue: i % 11 === 0,
  createdAt: isoDays(-(i * 10 + 30)),
}));

const agentApplications: AgentOnboarding[] = Array.from({ length: 9 }).map((_, i) => ({
  applicationId: `app_${i.toString(36).padStart(4, '0')}`,
  fullName: name(i + 11),
  phoneE164: phone(i * 13 + 9),
  stateCode: pick(STATES, i),
  submittedAt: isoDays(-i - 1),
  docsSubmitted: ['BVN', 'Selfie', 'Government ID'].slice(0, 2 + (i % 2)),
  bvnHashLastFour: `${(8000 + i * 137) % 9999}`.padStart(4, '0'),
  status: pick(
    ['IN_REVIEW', 'AWAITING_DOCS', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const,
    i,
  ),
  reviewer: i % 2 === 0 ? 'tunde.adekunle@surewina.ng' : null,
}));

const claims: Claim[] = Array.from({ length: 18 }).map((_, i) => {
  const stage = pick(
    ['NOTIFIED', 'SELECTED', 'KYC', 'DISPATCHED', 'DELIVERED', 'FORFEITED'] as const,
    i,
  );
  const draw = pick(draws.filter((d) => d.status === 'EXECUTED'), i);
  return {
    claimId: `clm_${i.toString(36).padStart(4, '0')}`,
    ticketRef: ticketRef(i + 200),
    drawCode: draw.drawCode,
    prizeDescription: draw.prizeDescription,
    prizeValueNgn: draw.prizeValueNgn,
    winnerPhoneE164: phone(i * 9 + 17),
    winnerName: i % 3 === 0 ? null : name(i + 17),
    stage,
    pathSelected:
      stage === 'NOTIFIED' ? null : (i % 3 === 0 ? 'CASH' : 'PRODUCT'),
    notifiedAt: isoDays(-i - 2),
    selectedAt: stage === 'NOTIFIED' ? null : isoDays(-i - 1),
    kycCompletedAt:
      stage === 'KYC' || stage === 'NOTIFIED' || stage === 'SELECTED'
        ? null
        : isoDays(-i),
    dispatchedAt:
      stage === 'DISPATCHED' || stage === 'DELIVERED' ? isoDays(-i + 1) : null,
    deliveredAt: stage === 'DELIVERED' ? isoDays(-i + 3) : null,
    forfeitsAt: isoDays(-i + 14),
    contactAttempts: 1 + (i % 4),
    notes: i % 5 === 0 ? 'Winner asked for product delivery to Lagos branch.' : null,
  };
});

const kycCases: KycCase[] = claims.slice(0, 8).map((c, i) => ({
  kycCaseId: `kyc_${i.toString(36).padStart(4, '0')}`,
  customerPhoneE164: c.winnerPhoneE164,
  claimId: c.claimId,
  level: c.prizeValueNgn > 1_000_000 ? 'TIER2' : 'TIER1',
  status: pick(['IN_REVIEW', 'AWAITING_DOCS', 'PASSED', 'IN_REVIEW'] as const, i),
  submittedAt: isoDays(-i - 1),
  docs: [
    { label: 'Government ID', uploadedAt: isoDays(-i - 1) },
    { label: 'Selfie with ID', uploadedAt: isoDays(-i - 1) },
    ...(c.prizeValueNgn > 1_000_000
      ? [{ label: 'Utility bill', uploadedAt: isoDays(-i - 1) }]
      : []),
  ],
  reviewer: i % 2 === 0 ? 'sade.bello@surewina.ng' : null,
  flags: i % 4 === 0 ? ['Selfie mismatch — needs manual review'] : [],
}));

const payouts: Payout[] = claims
  .filter((c) => c.pathSelected === 'CASH')
  .map((c, i) => {
    const wht = Math.round(c.prizeValueNgn * 0.05);
    return {
      payoutId: `pyt_${i.toString(36).padStart(4, '0')}`,
      claimId: c.claimId,
      ticketRef: c.ticketRef,
      customerPhoneE164: c.winnerPhoneE164,
      customerName: c.winnerName ?? 'Pending KYC',
      amountNgn: c.prizeValueNgn,
      whtNgn: wht,
      netNgn: c.prizeValueNgn - wht,
      status: pick(
        ['AWAITING_APPROVAL', 'APPROVED', 'PAID', 'AWAITING_APPROVAL'] as const,
        i,
      ),
      paymentMethod: i % 2 === 0 ? 'BANK_TRANSFER' : null,
      bankReference: i % 2 === 0 ? `GTB-PAYOUT-${10_000 + i * 13}` : null,
      whtCertificateNo: i % 3 === 0 ? `WHT-${new Date().getFullYear()}-${1000 + i}` : null,
      createdAt: isoDays(-i - 1),
    };
  });

const remittances: RemittanceRecord[] = (() => {
  const arr: RemittanceRecord[] = [];
  for (const agent of agents) {
    for (let d = 0; d < 3; d++) {
      arr.push({
        remittanceId: `rem_${agent.agentCode}_${d}`,
        agentCode: agent.agentCode,
        agentName: agent.fullName,
        date: new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10),
        owedNgn: 5000 + (d * 1000 + agent.monthlyTicketCount * 13) % 40_000,
        paidNgn:
          d === 0 && agent.remittanceOverdue
            ? 0
            : 5000 + (d * 1000 + agent.monthlyTicketCount * 13) % 40_000,
        status:
          d === 0
            ? agent.remittanceOverdue
              ? 'OVERDUE'
              : 'PENDING'
            : d === 1 && agent.remittanceCompliance < 0.85
              ? 'LATE'
              : 'PAID',
        receiptRef: d === 0 && agent.remittanceOverdue ? null : `GTB-TRF-${800_000 + d * 137}`,
      });
    }
  }
  return arr;
})();

const commissionLedger: CommissionLedgerEntry[] = agents.flatMap((agent, ai) =>
  Array.from({ length: 4 }).map((_, di) => {
    const basis = agent.monthlySalesNgn / 30 + di * 1000;
    return {
      entryId: `cle_${agent.agentCode}_${di}`,
      agentCode: agent.agentCode,
      agentName: agent.fullName,
      date: new Date(Date.now() - di * 86_400_000).toISOString().slice(0, 10),
      basisNgn: Math.round(basis),
      rate: agent.tier === 'GOLD' ? 0.12 : agent.tier === 'SILVER' ? 0.1 : 0.08,
      commissionNgn: Math.round(
        basis * (agent.tier === 'GOLD' ? 0.12 : agent.tier === 'SILVER' ? 0.1 : 0.08),
      ),
      overrideNgn: agent.isSuperAgent ? Math.round(basis * 0.02) : 0,
      status: di === 0 ? 'ACCRUED' : ai % 5 === 0 ? 'HELD' : 'DISBURSED',
    };
  }),
);

const jackpotMovements: JackpotMovement[] = (() => {
  const arr: JackpotMovement[] = [];
  let i = 0;
  for (let d = 60; d >= 0; d--) {
    arr.push({
      movementId: `jm_${d}_c`,
      at: new Date(Date.now() - d * 86_400_000).toISOString(),
      type: 'CONTRIBUTION',
      amountNgn: 120_000 + (d * 41) % 80_000,
      drawCode: null,
      note: '12% of daily ticket gross routed to jackpot pool.',
    });
    if (d % 7 === 5) {
      arr.push({
        movementId: `jm_${d}_p`,
        at: new Date(Date.now() - d * 86_400_000).toISOString(),
        type: 'PAYOUT',
        amountNgn: 4_000_000,
        drawCode: `RD-DRAW-${new Date(Date.now() - d * 86_400_000)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, '')}-JACKPOT`,
        note: 'Saturday jackpot paid.',
      });
    }
    i += 1;
  }
  return arr;
})();

const auditLog: AuditLogEntry[] = Array.from({ length: 60 }).map((_, i) => ({
  logId: `aud_${i.toString(36).padStart(5, '0')}`,
  at: iso(-i * 11),
  actorEmail: pick(
    [
      'tunde.adekunle@surewina.ng',
      'sade.bello@surewina.ng',
      'finance.officer@surewina.ng',
      'compliance@surewina.ng',
    ],
    i,
  ),
  actorRole: pick(['OPERATOR', 'SUPPORT_AGENT', 'FINANCE_OFFICER', 'COMPLIANCE_OFFICER'], i),
  action: pick(
    [
      'DRAW_OPEN',
      'CLAIM_APPROVED',
      'AGENT_SUSPENDED',
      'PAYOUT_RELEASED',
      'CONFIG_UPDATED',
      'KYC_REJECTED',
      'PROMO_CREATED',
      'TICKET_VOIDED',
    ],
    i,
  ),
  resourceType: pick(
    ['DRAW', 'CLAIM', 'AGENT', 'PAYOUT', 'CONFIG', 'KYC', 'PROMO', 'TICKET'],
    i,
  ),
  resourceId: pick(
    [
      draws[0].drawCode,
      claims[0]?.claimId ?? 'clm_0000',
      agents[0].agentCode,
      'pyt_0001',
      'cfg_pricing',
      kycCases[0]?.kycCaseId ?? 'kyc_0000',
      'cmp_summer',
      tickets[0].ticketRef,
    ],
    i,
  ),
  ipAddress: `41.${(i * 17) % 255}.${(i * 31) % 255}.${(i * 13) % 255}`,
  result: i % 19 === 0 ? 'DENIED' : i % 31 === 0 ? 'ERROR' : 'SUCCESS',
}));

const rngSeeds: RngSeed[] = draws
  .filter((d) => d.status === 'EXECUTED' || d.status === 'OPEN' || d.drawCode.includes('JACKPOT'))
  .slice(0, 14)
  .map((d, i) => ({
    seedId: `seed_${i.toString(36).padStart(4, '0')}`,
    drawCode: d.drawCode,
    commitHash: d.rngSeedHashCommit ?? `pending_${d.drawCode}`,
    revealedSeed: d.rngSeedReveal,
    committedAt: d.createdAt,
    revealedAt: d.status === 'EXECUTED' ? d.scheduledAt : null,
    status: d.rngSeedReveal ? 'REVEALED' : 'COMMITTED',
  }));

const templates: NotificationTemplate[] = [
  {
    templateId: 'tpl_sms_winner',
    channel: 'SMS',
    name: 'Winner notification',
    subject: null,
    body: 'Congratulations! Ticket {{ticket_ref}} won {{prize}}. Open Surewina to claim within 14 days.',
    lastUpdatedAt: isoDays(-5),
  },
  {
    templateId: 'tpl_sms_remit',
    channel: 'SMS',
    name: 'Remittance reminder',
    subject: null,
    body: 'Hi {{agent_name}}, ₦{{amount}} remittance is due before 23:00 today.',
    lastUpdatedAt: isoDays(-10),
  },
  {
    templateId: 'tpl_email_payout',
    channel: 'EMAIL',
    name: 'Payout confirmation',
    subject: 'Your Surewina prize payout',
    body: 'Hello {{name}}, your ₦{{amount}} prize was paid via {{method}}. WHT receipt attached.',
    lastUpdatedAt: isoDays(-2),
  },
  {
    templateId: 'tpl_push_draw',
    channel: 'PUSH',
    name: 'Draw closes soon',
    subject: null,
    body: 'The {{prize}} draw closes in 1 hour. Tap to buy your ticket.',
    lastUpdatedAt: isoDays(-1),
  },
];

const promos: PromoCampaign[] = [
  {
    campaignId: 'cmp_001',
    name: 'Easter weekend boost',
    code: 'EASTER25',
    type: 'PERCENTAGE_OFF',
    value: 25,
    redemptions: 1842,
    cap: 5000,
    startsAt: isoDays(-12),
    endsAt: isoDays(-4),
    status: 'ENDED',
  },
  {
    campaignId: 'cmp_002',
    name: 'New customer first ticket',
    code: 'FIRST500',
    type: 'FLAT_OFF',
    value: 200,
    redemptions: 412,
    cap: 10_000,
    startsAt: isoDays(-30),
    endsAt: isoDays(60),
    status: 'ACTIVE',
  },
  {
    campaignId: 'cmp_003',
    name: 'Jackpot bonus entries',
    code: 'BIGSAT',
    type: 'BONUS_ENTRIES',
    value: 2,
    redemptions: 88,
    cap: 1000,
    startsAt: isoDays(-2),
    endsAt: isoDays(2),
    status: 'ACTIVE',
  },
];

const adminUsers: AdminUserRow[] = [
  {
    adminUserId: 'usr_tunde_op_001',
    fullName: 'Tunde Adekunle',
    email: 'tunde.adekunle@surewina.ng',
    role: 'OPERATOR',
    mfaEnabled: true,
    lastLoginAt: iso(-30),
    status: 'ACTIVE',
  },
  {
    adminUserId: 'usr_sade_sup',
    fullName: 'Sade Bello',
    email: 'sade.bello@surewina.ng',
    role: 'SUPPORT_AGENT',
    mfaEnabled: true,
    lastLoginAt: iso(-120),
    status: 'ACTIVE',
  },
  {
    adminUserId: 'usr_finance',
    fullName: 'Ifeanyi Okafor',
    email: 'finance.officer@surewina.ng',
    role: 'FINANCE_OFFICER',
    mfaEnabled: true,
    lastLoginAt: isoDays(-1),
    status: 'ACTIVE',
  },
  {
    adminUserId: 'usr_compliance',
    fullName: 'Aisha Mohammed',
    email: 'compliance@surewina.ng',
    role: 'COMPLIANCE_OFFICER',
    mfaEnabled: true,
    lastLoginAt: isoDays(-2),
    status: 'ACTIVE',
  },
  {
    adminUserId: 'usr_invited',
    fullName: 'New Support Hire',
    email: 'support2@surewina.ng',
    role: 'SUPPORT_AGENT',
    mfaEnabled: false,
    lastLoginAt: null,
    status: 'INVITED',
  },
];

const amlFlags: AmlFlag[] = Array.from({ length: 8 }).map((_, i) => ({
  flagId: `aml_${i.toString(36).padStart(4, '0')}`,
  customerPhoneE164: phone(i * 11 + 1),
  rule: pick(
    [
      'Velocity > ₦200k in 24h',
      'Multiple large prizes in 14d',
      'KYC mismatch on second tier',
      'Structuring pattern detected',
    ],
    i,
  ),
  severity: pick(['MEDIUM', 'HIGH', 'LOW', 'HIGH'] as const, i),
  detail:
    'Customer activity exceeded threshold rule. Auto-flagged for compliance review.',
  status: pick(['OPEN', 'OPEN', 'CLEARED', 'ESCALATED_NFIU'] as const, i),
  raisedAt: isoDays(-i - 1),
}));

const failedPayments: FailedPayment[] = Array.from({ length: 6 }).map((_, i) => ({
  paymentId: `pay_failed_${i}`,
  at: iso(-i * 18),
  customerPhoneE164: phone(i * 17),
  amountNgn: pick([500, 500, 5000, 1000, 500], i),
  channel: pick(['CARD', 'TRANSFER', 'USSD', 'OPAY'] as const, i),
  reason: pick(
    [
      'Insufficient funds',
      'Card declined by issuer',
      '3DS challenge timed out',
      'Bank channel unavailable',
    ],
    i,
  ),
}));

// ============================================================
// Tier configuration
// ============================================================

export interface CommissionTierConfig {
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  minMonthlyTickets: number;
  rate: number;
  bonusNgn: number;
}

const commissionTiers: CommissionTierConfig[] = [
  { tier: 'BRONZE', minMonthlyTickets: 0, rate: 0.08, bonusNgn: 0 },
  { tier: 'SILVER', minMonthlyTickets: 200, rate: 0.1, bonusNgn: 5000 },
  { tier: 'GOLD', minMonthlyTickets: 400, rate: 0.12, bonusNgn: 15_000 },
];

// ============================================================
// Aggregations exposed as the admin "service"
// ============================================================

export const adminMock = {
  // ----- dashboard -----
  getDashboardKpis() {
    const today = draws.find((d) => d.status === 'OPEN') ?? draws[0];
    const ticketsToday = tickets.filter(
      (t) => t.drawCode === today.drawCode || isInLast24h(t.createdAt),
    );
    const grossToday = ticketsToday.reduce((sum, t) => sum + t.amountNgn, 0);
    const activeAgents = agents.filter((a) => a.status === 'ACTIVE').length;
    const remittanceCompliance =
      agents.reduce((s, a) => s + a.remittanceCompliance, 0) / agents.length;
    const jackpotBalance = jackpotMovements.reduce(
      (s, m) => s + (m.type === 'PAYOUT' ? -m.amountNgn : m.amountNgn),
      0,
    );

    let jackpotState: 'GREEN' | 'AMBER' | 'RED' = 'GREEN';
    if (jackpotBalance < 1_500_000) jackpotState = 'RED';
    else if (jackpotBalance < 3_500_000) jackpotState = 'AMBER';

    return {
      ticketsToday: ticketsToday.length,
      grossTodayNgn: grossToday,
      activeAgents,
      remittanceCompliance,
      jackpot: { balanceNgn: jackpotBalance, state: jackpotState },
      nextDrawAt: today.scheduledAt,
      nextDrawCode: today.drawCode,
      nextDrawPrize: today.prizeDescription,
    };
  },

  getTodaysDraws(): Draw[] {
    const today = new Date().toISOString().slice(0, 10);
    return draws.filter(
      (d) =>
        d.scheduledAt.slice(0, 10) === today ||
        (d.status === 'OPEN' && d.cutoffAt.slice(0, 10) === today),
    );
  },

  /** Auditor chain — last 30 seconds-ish of signed ticket counters (visual). */
  getAuditorChain(): Array<{ at: string; tickets: number; signature: string }> {
    const arr: Array<{ at: string; tickets: number; signature: string }> = [];
    for (let i = 0; i < 12; i++) {
      arr.push({
        at: iso(-i * 0.05),
        tickets: 9_140 + (i * 19) % 60,
        signature: `0x${(0xa1b2 + i * 137).toString(16)}${(i * 13).toString(16)}9f`.slice(0, 10),
      });
    }
    return arr.reverse();
  },

  getFailedPayments(): FailedPayment[] {
    return failedPayments;
  },

  // ----- draws -----
  listDraws(filter?: { status?: DrawStatus; q?: string }): Draw[] {
    let arr = draws;
    if (filter?.status) arr = arr.filter((d) => d.status === filter.status);
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(
        (d) =>
          d.drawCode.toLowerCase().includes(q) ||
          d.prizeDescription.toLowerCase().includes(q),
      );
    }
    return arr;
  },

  getDraw(id: string): Draw | null {
    return draws.find((d) => d.drawCode === id || d.drawId === id) ?? null;
  },

  // ----- tickets -----
  listTickets(filter?: { q?: string; drawCode?: string }): AdminTicket[] {
    let arr = tickets;
    if (filter?.drawCode) arr = arr.filter((t) => t.drawCode === filter.drawCode);
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(
        (t) =>
          t.ticketRef.toLowerCase().includes(q) ||
          t.customerPhoneE164.includes(q) ||
          t.drawCode.toLowerCase().includes(q),
      );
    }
    return arr;
  },

  getTicket(ref: string): AdminTicket | null {
    return tickets.find((t) => t.ticketRef === ref) ?? null;
  },

  // ----- customers -----
  listCustomers(q?: string): AdminCustomer[] {
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.phoneE164.includes(q) ||
        (c.displayName ?? '').toLowerCase().includes(q.toLowerCase()),
    );
  },

  getCustomer(id: string): AdminCustomer | null {
    return customers.find((c) => c.customerId === id) ?? null;
  },

  // ----- disputes -----
  listDisputes(): Dispute[] {
    return disputes;
  },
  getDispute(id: string): Dispute | null {
    return disputes.find((d) => d.disputeId === id) ?? null;
  },

  // ----- agents -----
  listAgents(filter?: { status?: AdminAgent['status']; q?: string }): AdminAgent[] {
    let arr = agents;
    if (filter?.status) arr = arr.filter((a) => a.status === filter.status);
    if (filter?.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(
        (a) =>
          a.agentCode.toLowerCase().includes(q) ||
          a.fullName.toLowerCase().includes(q) ||
          a.phoneE164.includes(q),
      );
    }
    return arr;
  },
  getAgent(id: string): AdminAgent | null {
    return agents.find((a) => a.agentCode === id || a.agentId === id) ?? null;
  },
  listAgentApplications(): AgentOnboarding[] {
    return agentApplications;
  },
  getAgentApplication(id: string): AgentOnboarding | null {
    return agentApplications.find((a) => a.applicationId === id) ?? null;
  },
  getSuperAgents(): AdminAgent[] {
    return agents.filter((a) => a.isSuperAgent);
  },
  getCommissionTiers(): CommissionTierConfig[] {
    return commissionTiers;
  },

  // ----- claims -----
  listClaims(stage?: ClaimStage): Claim[] {
    return stage ? claims.filter((c) => c.stage === stage) : claims;
  },
  getClaim(id: string): Claim | null {
    return claims.find((c) => c.claimId === id) ?? null;
  },
  listKycCases(): KycCase[] {
    return kycCases;
  },
  getKycCase(id: string): KycCase | null {
    return kycCases.find((k) => k.kycCaseId === id) ?? null;
  },
  listPayouts(): Payout[] {
    return payouts;
  },
  getPayout(id: string): Payout | null {
    return payouts.find((p) => p.payoutId === id) ?? null;
  },

  // ----- remittance & finance -----
  listRemittances(): RemittanceRecord[] {
    return remittances;
  },
  listDefaulters(): RemittanceRecord[] {
    return remittances.filter((r) => r.status === 'OVERDUE' || r.status === 'LATE');
  },
  listCommissionLedger(): CommissionLedgerEntry[] {
    return commissionLedger;
  },
  getJackpotMovements(): JackpotMovement[] {
    return jackpotMovements;
  },
  getJackpotBalance(): number {
    return jackpotMovements.reduce(
      (s, m) => s + (m.type === 'PAYOUT' ? -m.amountNgn : m.amountNgn),
      0,
    );
  },
  getFinancialPnl(period: 'daily' | 'weekly' | 'monthly') {
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    const ticketsIn = tickets
      .filter((t) => new Date(t.createdAt).getTime() >= cutoff)
      .reduce((s, t) => s + t.amountNgn, 0);
    const payoutsOut = payouts.reduce((s, p) => s + p.amountNgn, 0);
    const commissionOut = commissionLedger
      .filter((c) => new Date(c.date).getTime() >= cutoff)
      .reduce((s, c) => s + c.commissionNgn + c.overrideNgn, 0);
    return {
      revenueNgn: ticketsIn,
      prizesNgn: payoutsOut * (days / 30),
      commissionNgn: commissionOut,
      netNgn: Math.round(ticketsIn - payoutsOut * (days / 30) - commissionOut),
      period,
    };
  },

  // ----- compliance / reports -----
  getStateBreakdown(): Array<{ state: string; tickets: number; salesNgn: number }> {
    const map = new Map<string, { tickets: number; salesNgn: number }>();
    for (const state of STATES) map.set(state, { tickets: 0, salesNgn: 0 });
    tickets.forEach((t, i) => {
      const state = pick(STATES, i);
      const row = map.get(state)!;
      row.tickets += 1;
      row.salesNgn += t.amountNgn;
    });
    return Array.from(map.entries()).map(([state, v]) => ({ state, ...v }));
  },
  listAmlFlags(): AmlFlag[] {
    return amlFlags;
  },

  // ----- audit / system -----
  listAuditLog(): AuditLogEntry[] {
    return auditLog;
  },
  listRngSeeds(): RngSeed[] {
    return rngSeeds;
  },
  listNotificationTemplates(): NotificationTemplate[] {
    return templates;
  },
  listPromos(): PromoCampaign[] {
    return promos;
  },
  getPromo(id: string): PromoCampaign | null {
    return promos.find((p) => p.campaignId === id) ?? null;
  },
  listAdminUsers(): AdminUserRow[] {
    return adminUsers;
  },
};

function isInLast24h(iso: string) {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60_000;
}
