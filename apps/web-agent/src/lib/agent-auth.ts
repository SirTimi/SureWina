import type { AgentMe } from '@surewina/types';

const ACCESS_TOKEN_KEY = 'surewina_agent_access_token';
const REFRESH_TOKEN_KEY = 'surewina_agent_refresh_token';
const AGENT_KEY = 'surewina_agent';

export function saveAgentSession(input: {
  accessToken: string;
  refreshToken: string;
  agent: AgentMe;
}) {
  if (typeof window === 'undefined') return;

  localStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
  localStorage.setItem(AGENT_KEY, JSON.stringify(input.agent));
}

export function getStoredAgent(): AgentMe | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(AGENT_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as AgentMe;
  } catch {
    return null;
  }
}

export function clearAgentSession() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(AGENT_KEY);
}