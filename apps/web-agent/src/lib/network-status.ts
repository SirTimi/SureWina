const LEGACY_OFFLINE_SALES_KEY = 'surewina_agent_offline_sales';

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Prepaid agent sales must be authorised against the live wallet at sale time,
 * so old speculative localStorage sales must never be replayed later.
 *
 * Remove any queue left by pre-prepaid builds when the authenticated shell
 * starts. This is deliberately discard-only: no API call is made.
 */
export function discardLegacyOfflineSales(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(LEGACY_OFFLINE_SALES_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
    // The important safety property is that nothing attempts to replay it.
  }
}
