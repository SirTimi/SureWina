const ACCESS_KEY = 'surewina_access_token';
const REFRESH_KEY = 'surewina_refresh_token';
const USER_ID_KEY = 'surewina_user_id';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function isSignedIn(): boolean {
  return getAccessToken() !== null;
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export function setAuth(tokens: {
  accessToken: string;
  refreshToken: string;
  userId: string;
}): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  localStorage.setItem(USER_ID_KEY, tokens.userId);
}