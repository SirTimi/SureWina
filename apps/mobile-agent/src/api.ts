import { ApiError, createClient } from '@surewina/api-client';
import { clearSession, readSession, storeSession } from './session';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';

export class SessionExpiredError extends Error {
  constructor() { super('Your session expired. Sign in again to continue.'); }
}

export function checkApiConfiguration(): string | null {
  if (!API_URL) return 'Set EXPO_PUBLIC_API_URL in apps/mobile-agent/.env before starting Expo.';
  if (!/^https?:\/\//.test(API_URL)) return 'EXPO_PUBLIC_API_URL must start with http:// or https://.';
  if (/localhost|127\.0\.0\.1/.test(API_URL)) {
    return 'On a physical phone, use your computer LAN IP or an HTTPS API address, not localhost.';
  }
  return null;
}

export const api = createClient({
  baseUrl: API_URL,
  getAuthToken: async () => (await readSession())?.accessToken ?? null,
});

// At most one refresh can rotate an agent session when concurrent requests
// receive 401s. We never erase credentials due to mere network failure.
let rotation: Promise<void> | null = null;

async function rotateTokens(): Promise<void> {
  if (!rotation) {
    rotation = (async () => {
      const tokens = await readSession();
      if (!tokens?.refreshToken) throw new SessionExpiredError();
      try {
        const refreshed = await api.agents.refresh(tokens.refreshToken);
        await storeSession({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearSession();
          throw new SessionExpiredError();
        }
        throw error;
      }
    })().finally(() => { rotation = null; });
  }
  return rotation;
}

export async function authorized<T>(action: () => Promise<T>): Promise<T> {
  const accessAtStart = (await readSession())?.accessToken;
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // A parallel request may already have rotated our token. Do not rotate
    // twice in response to two 401s from the same expired access token.
    const latest = (await readSession())?.accessToken;
    if (!latest || latest === accessAtStart) {
      await rotateTokens();
    }
    return action();
  }
}
