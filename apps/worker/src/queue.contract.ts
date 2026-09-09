// Keep in sync with apps/api/src/queue/notification-queue.service.ts
export const NOTIFICATIONS_QUEUE = 'notifications';
export const JOB_TICKET_CONFIRMATION_SMS = 'ticket-confirmation-sms';
export const JOB_REDEMPTION_CODE_SMS = 'redemption-code-sms'


export type TicketConfirmationSmsJob = {
  txnId: string;
  buyerPhone: string;
  drawCode: string;
  ticketRefs: string[];
  drawScheduledAt: string;
  amountNgn: number;
};

export const JOB_WINNER_SMS = 'winner-sms';

export type WinnerSmsJob = {
  drawId: string;
  drawCode: string;
  winnerPhone: string;
  winnerRef: string; // ticketRef or ENTRY-<id>
  prizeDescription: string;
  drawScheduledAt: string;
  prizeValueNgn: number;
};

export type RedemptionCodeSmsJob = {
  claimId: string;
  winnerPhone: string;
  code: string;
  prizeDescription: string;
  claimDeadlineAt: string;
  attempt?: number
}

export const JOB_JACKPOT_ENTRY_SMS = 'jackpot-entry-sms';

export type JackpotEntrySmsJob = {
  // One job per mint, keyed on the accumulation row and the count so far —
  // a customer who earns a second entry in the same week gets a second
  // message, but a retry of the same mint does not.
  accumId: string;
  buyerPhone: string;
  entriesMinted: number;
  entriesThisWeek: number;
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
};