export type DrawScheduleType = 'DAILY_DRAW' | 'SATURDAY_JACKPOT';
export type DrawScheduleStatus = 'ACTIVE' | 'PENDING_CHANGE' | 'SUSPENDED';

export interface DrawScheduleRule {
  scheduleId: string;
  scheduleType: DrawScheduleType;
  drawName: string;
  recurrence: string;
  ticketSaleStartTime: string;
  cutoffTime: string;
  drawExecutionTime: string;
  processingDelayMinutes: number;
  reopenDelayMinutes: number;
  effectiveFrom: string;
  status: DrawScheduleStatus;
  lastChangedBy: string;
  lastChangedAt: string;
}

export interface TicketPriceVersion {
  versionId: string;
  ticketType: 'REGULAR_DAILY' | 'DIRECT_JACKPOT';
  label: string;
  priceNgn: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'RETIRED';
  createdBy: string;
}

export interface DrawFormulaVersion {
  versionId: string;
  label: string;
  formulaSummary: string;
  effectiveFrom: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'RETIRED';
  createdBy: string;
}

export const drawScheduleRules: DrawScheduleRule[] = [
  {
    scheduleId: 'sch_daily_001',
    scheduleType: 'DAILY_DRAW',
    drawName: 'Daily named draw rotation',
    recurrence: 'Every day except Saturday jackpot window',
    ticketSaleStartTime: '21:00',
    cutoffTime: '19:00',
    drawExecutionTime: '20:00',
    processingDelayMinutes: 60,
    reopenDelayMinutes: 60,
    effectiveFrom: '2026-05-01',
    status: 'ACTIVE',
    lastChangedBy: 'Tunde Adekunle',
    lastChangedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    scheduleId: 'sch_jackpot_001',
    scheduleType: 'SATURDAY_JACKPOT',
    drawName: 'Sure Jackpot',
    recurrence: 'Every Saturday',
    ticketSaleStartTime: '21:00',
    cutoffTime: '19:00',
    drawExecutionTime: '20:00',
    processingDelayMinutes: 60,
    reopenDelayMinutes: 60,
    effectiveFrom: '2026-05-01',
    status: 'ACTIVE',
    lastChangedBy: 'Tunde Adekunle',
    lastChangedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },
];

export const ticketPriceVersions: TicketPriceVersion[] = [
  {
    versionId: 'price_regular_v1',
    ticketType: 'REGULAR_DAILY',
    label: 'Regular daily ticket',
    priceNgn: 500,
    effectiveFrom: '2026-05-01',
    effectiveTo: null,
    status: 'ACTIVE',
    createdBy: 'Tunde Adekunle',
  },
  {
    versionId: 'price_jackpot_v1',
    ticketType: 'DIRECT_JACKPOT',
    label: 'Direct Sure Jackpot ticket',
    priceNgn: 5000,
    effectiveFrom: '2026-05-01',
    effectiveTo: null,
    status: 'ACTIVE',
    createdBy: 'Tunde Adekunle',
  },
  {
    versionId: 'price_regular_pending_001',
    ticketType: 'REGULAR_DAILY',
    label: 'Regular daily ticket proposed change',
    priceNgn: 500,
    effectiveFrom: '2026-06-15',
    effectiveTo: null,
    status: 'PENDING_APPROVAL',
    createdBy: 'Ifeanyi Okafor',
  },
];

export const drawFormulaVersions: DrawFormulaVersion[] = [
  {
    versionId: 'formula_v1',
    label: 'Current RNG draw formula',
    formulaSummary:
      'Committed seed hash before draw, ticket bucket locked at cutoff, final random selection executed after schedule time.',
    effectiveFrom: '2026-05-01',
    status: 'ACTIVE',
    createdBy: 'Tunde Adekunle',
  },
  {
    versionId: 'formula_pending_001',
    label: 'Proposed draw formula adjustment',
    formulaSummary:
      'Pending review for draw bucket validation and jackpot qualification reconciliation before final selection.',
    effectiveFrom: '2026-06-15',
    status: 'PENDING_APPROVAL',
    createdBy: 'Ifeanyi Okafor',
  },
];

export function getDrawScheduleRules() {
  return drawScheduleRules;
}

export function getTicketPriceVersions() {
  return ticketPriceVersions;
}

export function getDrawFormulaVersions() {
  return drawFormulaVersions;
}

export function scheduleStatusTone(
  status: DrawScheduleStatus | TicketPriceVersion['status'] | DrawFormulaVersion['status'],
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING_CHANGE' || status === 'PENDING_APPROVAL') return 'warning';
  if (status === 'SUSPENDED') return 'danger';
  return 'neutral';
}

export function drawScheduleTypeLabel(type: DrawScheduleType) {
  if (type === 'DAILY_DRAW') return 'Daily draw';
  return 'Saturday jackpot';
}