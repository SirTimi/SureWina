// Keep in sync with apps/api/src/queue/notification-queue.service.ts
export const NOTIFICATIONS_QUEUE = 'notifications';
export const JOB_TICKET_CONFIRMATION_SMS = 'ticket-confirmation-sms';

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