// Approved SMS copy (SUREWINA_SMS_Draft). Keep every message inside one
// 160-char GSM-7 segment — and never use '₦', which forces UCS-2 and drops
// the limit to 70. Use 'N' as in the approved drafts.

const SUPPORT_LINE = '080 8000 9000'; // placeholder until the real line is live
const DAY_ABBREV = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const WAT_OFFSET_MS = 60 * 60 * 1000;

function watDate(iso: string | Date): Date {
  return new Date(new Date(iso).getTime() + WAT_OFFSET_MS);
}

// "Monday, 19 May 2025"
export function longDate(iso: string | Date): string {
  const d = watDate(iso);
  return d.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Daily draws are branded by their WAT weekday; Saturday is the jackpot.
export function drawHeader(drawCode: string, scheduledAt: string | Date): string {
  if (drawCode.includes('JACKPOT')) return 'SUREWINA - JACKPOT';
  return `SUREWINA-${DAY_ABBREV[watDate(scheduledAt).getUTCDay()]}`;
}

export function naira(amount: number): string {
  return `N${amount.toLocaleString('en-NG')}`;
}

// ── Purchase ──────────────────────────────────────────────
// One summary message per transaction rather than one per ticket: same
// information, a fraction of the cost on multi-ticket buys.
export function ticketPurchase(args: {
  drawCode: string;
  scheduledAt: string | Date;
  ticketRefs: string[];
  amountNgn: number;
}): string {
  const multiple = args.ticketRefs.length > 1;
  const ticketLine = multiple
    ? `Tickets (${args.ticketRefs.length}): ${args.ticketRefs.join(', ')}`
    : `Ticket No: ${args.ticketRefs[0]}`;

  return [
    drawHeader(args.drawCode, args.scheduledAt),
    ticketLine,
    `Draw Date: ${longDate(args.scheduledAt)}`,
    `Amount Paid: ${naira(args.amountNgn)}`,
    'Terms & Conditions apply.',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}

// ── Winner ────────────────────────────────────────────────
export function winnerNotice(args: {
  drawCode: string;
  scheduledAt: string | Date;
  winnerRef: string;
  prizeDescription: string;
  claimDeadlineAt: string | Date;
}): string {
  return [
    drawHeader(args.drawCode, args.scheduledAt),
    `Win Ticket No: ${args.winnerRef}`,
    `Expiry: ${longDate(args.claimDeadlineAt)}`,
    `Prize: ${args.prizeDescription}`,
    'Collection: See Agent or visit online.',
    'Keep Winning BIG!',
    'www.surewina.com',
  ].join('\n');
}

// ── Redemption OTP ────────────────────────────────────────
export function redemptionOtp(otp: string, expiryMinutes = 5): string {
  return [
    'SUREWINA',
    `OTP: ${otp}`,
    `Expiry: ${expiryMinutes} Mins`,
    'Use OTP to verify & Complete prize redemption.',
    'Keep Playing to Win BIG!',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}

// ── Post-redemption ───────────────────────────────────────
export function prizeCollected(args: {
  winnerRef: string;
  prizeDescription: string;
  collectedAt: string | Date;
  method: 'AGENT' | 'BANK TRANSFER' | 'COLLECTION POINT';
}): string {
  return [
    'SUREWINA',
    `Win Ticket No: ${args.winnerRef}`,
    `Prize: ${args.prizeDescription}`,
    `PRIZE COLLECTED - ${longDate(args.collectedAt)}`,
    `Method: via ${args.method}`,
    'Keep Playing to Win BIG!',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}

// ── Forfeiture (not in the approved set) ──────────────────
// Ours, not from the draft — flag for approval before real sends.
export function claimForfeited(winnerRef: string): string {
  return [
    'SUREWINA',
    `Win Ticket No: ${winnerRef}`,
    'Your claim window has closed and this prize is forfeited.',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}