/**
 * Tiny offline-queue for the sale flow.
 *
 * Tecno Camon agents will lose 3G mid-sale. To keep the 60-second target the
 * sale flow speculatively writes a queued sale to localStorage and tries to
 * sync as soon as the browser reports online. The customer keeps the ticket
 * reference either way; the agent dashboard surfaces "pending sync" sales.
 */

import { api } from './api';

export interface QueuedSale {
  queueId: string;
  drawCode: string;
  quantity: number;
  customerPhone: string | null;
  ticketRef: string;
  stateOfPlayCode: string;
  queuedAt: string;
}

const KEY = 'surewina_agent_offline_sales';

export function readQueue(): QueuedSale[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedSale[];
  } catch {
    return [];
  }
}

export function enqueueSale(sale: QueuedSale) {
  if (typeof window === 'undefined') return;
  const queue = readQueue();
  queue.unshift(sale);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function removeFromQueue(queueId: string) {
  if (typeof window === 'undefined') return;
  const queue = readQueue().filter((q) => q.queueId !== queueId);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = readQueue();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await api.agents.sell({
        drawCode: item.drawCode,
        quantity: item.quantity,
        stateOfPlayCode: item.stateOfPlayCode,
        customerPhone: item.customerPhone ?? undefined,
      })
      removeFromQueue(item.queueId);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
