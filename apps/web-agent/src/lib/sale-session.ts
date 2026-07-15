/**
 * Sale-flow ephemeral state.
 *
 * The 60-second sale flow spans short screens:
 * /sell → /sell/quantity → /sell/confirm → /sell/done/[ref].
 */
export type SaleTicketKind = 'DAILY' | 'JACKPOT';

export interface SaleDraft {
  drawCode: string;
  drawLabel: string;
  ticketKind: SaleTicketKind;
  ticketPriceNgn: number;
  quantity: number;
  customerPhone: string | null;
  stateOfPlayCode: string;
  startedAt: number;
}

const KEY = 'surewina_agent_sale_draft';

export function readSaleDraft(): SaleDraft | null {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SaleDraft;
  } catch {
    return null;
  }
}

export function writeSaleDraft(draft: SaleDraft) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function patchSaleDraft(patch: Partial<SaleDraft>): SaleDraft | null {
  const current = readSaleDraft();
  if (!current) return null;

  const next = { ...current, ...patch };
  writeSaleDraft(next);

  return next;
}

export function clearSaleDraft() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}