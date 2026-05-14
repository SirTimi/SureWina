export type AdminRole = 'OPERATOR' | 'COMPLIANCE_OFFICER' | 'FINANCE_OFFICER' | 'SUPPORT_AGENT';

export interface AdminSession {
  adminUserId: string;
  email: string;
  fullName: string;
  role: AdminRole;
  mfaEnabled: boolean;
  lastLoginAt: string;
}

const SESSION_KEY = 'surewina_admin_session';

const DEFAULT_SESSION: AdminSession = {
  adminUserId: 'usr_tunde_op_001',
  email: 'tunde.adekunle@surewina.ng',
  fullName: 'Tunde Adekunle',
  role: 'OPERATOR',
  mfaEnabled: true,
  lastLoginAt: new Date().toISOString(),
};

export function getStoredSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AdminSession) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

/** Returns the default seed session — used by the layout to start signed-in for demos. */
export function seedSessionIfMissing(): AdminSession {
  const existing = getStoredSession();
  if (existing) return existing;
  saveSession(DEFAULT_SESSION);
  return DEFAULT_SESSION;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'OPERATOR':
      return 'Operator';
    case 'COMPLIANCE_OFFICER':
      return 'Compliance';
    case 'FINANCE_OFFICER':
      return 'Finance';
    case 'SUPPORT_AGENT':
      return 'Support';
  }
}

export function roleTone(role: AdminRole): string {
  switch (role) {
    case 'OPERATOR':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'COMPLIANCE_OFFICER':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'FINANCE_OFFICER':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    case 'SUPPORT_AGENT':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
}

/**
 * Role-based screen access. Operator sees everything by default for demos;
 * the matrix is otherwise restrictive.
 */
export function canAccess(role: AdminRole, screen: string): boolean {
  if (role === 'OPERATOR') return true;

  const matrix: Record<AdminRole, string[]> = {
    OPERATOR: ['*'],
    COMPLIANCE_OFFICER: [
      '/',
      '/compliance',
      '/compliance/aml',
      '/kyc/review',
      '/reports',
      '/reports/financial',
      '/audit-log',
      '/rng-seeds',
      '/draws',
      '/draws/audit',
      '/tickets',
      '/customers',
      '/claims',
    ],
    FINANCE_OFFICER: [
      '/',
      '/remittance',
      '/commission',
      '/jackpot-fund',
      '/payouts',
      '/reports',
      '/reports/financial',
      '/audit-log',
    ],
    SUPPORT_AGENT: [
      '/',
      '/tickets',
      '/customers',
      '/disputes',
      '/claims',
      '/agents',
    ],
  };

  const allowed = matrix[role];
  if (allowed.includes('*')) return true;
  return allowed.some((path) => screen === path || screen.startsWith(`${path}/`));
}
