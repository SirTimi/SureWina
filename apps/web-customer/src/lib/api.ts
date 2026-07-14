import { createClient } from '@surewina/api-client';

const TOKEN_KEY = 'surewina_access_token';

// Client-side token store. localStorage keeps it across reloads; guards make
// it a no-op during SSR (server components pass skipAuth or are public).
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export const api = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1',
  getAuthToken: getStoredToken,
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
      window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
    }
  },
});

// 401 on a protected page means "not signed in", not "not found".
// Returns true if it redirected (caller should stop rendering errors).
export function redirectToSignInOn401(err: unknown, nextPath: string): boolean {
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('401')) {
    window.location.href = `/sign-in?next=${encodeURIComponent(nextPath)}`;
    return true;
  }
  return false;
}