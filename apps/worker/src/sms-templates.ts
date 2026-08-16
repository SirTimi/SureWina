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
// One message per ticket, not one per transaction. Agents print the SMS as
// the physical slip, so each message must stand alone as a complete ticket:
// its own ref, its own face value, and "1 of 3" so a buyer holding three
// slips can tell none went missing.
//
// The sequence marker is omitted on single-ticket buys — "Ticket 1 of 1"
// reads like a system artefact on a slip handed to a customer.
export function ticketPurchase(args: {
  drawCode: string;
  scheduledAt: string | Date;
  ticketRef: string;
  faceValueNgn: number;
  sequence?: { position: number; total: number };
}): string {
  const ticketLine =
    args.sequence && args.sequence.total > 1
      ? `Ticket ${args.sequence.position} of ${args.sequence.total}: ${args.ticketRef}`
      : `Ticket No: ${args.ticketRef}`;

  return [
    drawHeader(args.drawCode, args.scheduledAt),
    ticketLine,
    `Draw Date: ${longDate(args.scheduledAt)}`,
    `Amount Paid: ${naira(args.faceValueNgn)}`,
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

// ── Segment accounting ────────────────────────────────────
// Every message in this file is meant to fit one segment. The worst case
// below measures 159 of 160, so there is one character of slack — any copy
// change can silently double the send cost. This makes that visible instead
// of leaving it to an invoice three weeks later.

// GSM 03.38 default alphabet. Anything outside it forces the whole message
// to UCS-2, which cuts the single-segment limit from 160 to 70.
const GSM7_BASE =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Sent as an escape pair, so each costs two characters of the budget.
const GSM7_EXTENDED = '^{}\\[~]|€';

export function smsPlan(message: string): {
  encoding: 'GSM7' | 'UCS2';
  length: number;
  segments: number;
} {
  let length = 0;

  for (const ch of message) {
    if (GSM7_BASE.includes(ch)) {
      length += 1;
    } else if (GSM7_EXTENDED.includes(ch)) {
      length += 2;
    } else {
      // One stray character (a '₦', a curly quote pasted from Word) drops
      // the whole message to UCS-2.
      const ucs2 = [...message].length;
      return {
        encoding: 'UCS2',
        length: ucs2,
        segments: ucs2 <= 70 ? 1 : Math.ceil(ucs2 / 67),
      };
    }
  }

  return {
    encoding: 'GSM7',
    length,
    // Concatenated messages spend 7 characters per segment on the UDH.
    segments: length <= 160 ? 1 : Math.ceil(length / 153),
  };
}

// ── Remittance deadline ───────────────────────────────────────
// Both fit one segment. Run sms-preview if the copy changes.

export function remittanceDueWarning(args: {
  amountNgn: number;
  periodDate: Date;
}): string {
  const d = args.periodDate.toISOString().slice(0, 10).split('-').reverse().join('/');
  return [
    'SUREWINA',
    `Remittance due: ${naira(args.amountNgn)}`,
    `For sales on ${d}`,
    'Pay before 11:00am today or your account will be locked from selling.',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}

export function remittanceOverdueLock(args: { amountNgn: number }): string {
  return [
    'SUREWINA',
    'Your account is locked from selling.',
    `Unsettled remittance: ${naira(args.amountNgn)}`,
    'Selling resumes automatically once you settle.',
    `Customer care: ${SUPPORT_LINE}`,
  ].join('\n');
}