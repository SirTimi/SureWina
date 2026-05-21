const PRIZE_PAYOUT_LEDGER_KEY = 'surewina_agent_prize_payouts';

export interface AgentPrizePayoutEntry {
  ticketRef: string;
  paidAt: string;
  paidNgn: number;
  method: 'CASH' | 'TRANSFER';
  customerPhone: string | null;
}

export interface AgentPrizePayoutSummary {
  count: number;
  totalPaidNgn: number;
  latestPaidAt: string | null;
}

function readLedger(): AgentPrizePayoutEntry[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(PRIZE_PAYOUT_LEDGER_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as AgentPrizePayoutEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLedger(entries: AgentPrizePayoutEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRIZE_PAYOUT_LEDGER_KEY, JSON.stringify(entries));
}

export function recordPrizePayout(entry: Omit<AgentPrizePayoutEntry, 'paidAt'> & { paidAt?: string }) {
  const paidAt = entry.paidAt ?? new Date().toISOString();
  const existing = readLedger().filter((item) => item.ticketRef !== entry.ticketRef);

  writeLedger([
    {
      ticketRef: entry.ticketRef,
      paidAt,
      paidNgn: entry.paidNgn,
      method: entry.method,
      customerPhone: entry.customerPhone,
    },
    ...existing,
  ]);
}

export function getPrizePayoutSummary(): AgentPrizePayoutSummary {
  const today = new Date().toISOString().slice(0, 10);
  const todaysPayouts = readLedger().filter((entry) => entry.paidAt.slice(0, 10) === today);

  return {
    count: todaysPayouts.length,
    totalPaidNgn: todaysPayouts.reduce((sum, entry) => sum + entry.paidNgn, 0),
    latestPaidAt: todaysPayouts[0]?.paidAt ?? null,
  };
}
