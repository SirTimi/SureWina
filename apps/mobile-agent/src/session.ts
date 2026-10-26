import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'surewina.agent.session.v1';

export interface AgentSession {
  accessToken: string;
  refreshToken: string;
}

export async function readSession(): Promise<AgentSession | null> {
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed && typeof parsed === 'object' &&
      typeof (parsed as AgentSession).accessToken === 'string' &&
      typeof (parsed as AgentSession).refreshToken === 'string'
    ) return parsed as AgentSession;
  } catch {
    // Corrupt local session is treated as signed out.
  }
  await clearSession();
  return null;
}

export async function storeSession(tokens: AgentSession): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
