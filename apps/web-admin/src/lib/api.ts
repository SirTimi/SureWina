import { createClient, type AdminMe } from '@surewina/api-client';
import type { AdminSession } from './admin-auth';

const TOKEN_KEY = 'surewina_admin_access_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
}

export const api = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1',
  getAuthToken: getStoredToken,
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
      window.location.href = '/sign-in';
    }
  },
});

// Maps the backend admin (functional role + tier) onto the frontend session.
// Backend tier is BASIC/INTERMEDIATE/SUPER/AUDITOR; the frontend's tier type
// uses the _ADMIN suffix, so normalize here at the boundary.
const TIER_MAP: Record<string, AdminSession['tier']> = {
  BASIC: 'BASIC_ADMIN',
  INTERMEDIATE: 'INTERMEDIATE_ADMIN',
  SUPER: 'SUPER_ADMIN',
  AUDITOR: 'AUDITOR',
};

// Takes AdminMe directly rather than a hand-written copy of its shape. The
// duplicate drifted once already — a field added to the API response has to
// be added here too, and the compiler will not tell you if it is not.
export function toAdminSession(admin: AdminMe): AdminSession {
  return {
    adminUserId: admin.adminUserId,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    tier: TIER_MAP[admin.tier] ?? 'BASIC_ADMIN',
    mfaEnabled: admin.mfaEnabled,
    lastLoginAt: admin.lastLoginAt ?? new Date().toISOString(),
    collectionPointId: admin.collectionPointId ?? null,
    mustChangePassword: admin.mustChangePassword,
  };
}