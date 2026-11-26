import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentMe } from '@surewina/types';
import { api, authorized, checkApiConfiguration, SessionExpiredError } from './api';
import { messageOf } from './format';
import { clearSession, readSession, storeSession, type AgentSession } from './session';

// One place that knows whether this device is signed in. Every screen reads
// it; only this file changes it.

export type AuthStatus = 'loading' | 'signed-out' | 'offline' | 'signed-in';

type AuthValue = {
  status: AuthStatus;
  agent: AgentMe | null;
  // Why the device is signed out or offline, for the screen to show.
  notice: string | null;
  restore: () => Promise<void>;
  completeSignIn: (tokens: AgentSession) => Promise<void>;
  // A screen saw the session end (refresh refused): go to sign-in.
  expire: (message?: string) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [agent, setAgent] = useState<AgentMe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAgent = useCallback(async () => {
    const me = await authorized(() => api.agents.getMe());
    setAgent(me.agent);
  }, []);

  const restore = useCallback(async () => {
    setStatus('loading');
    setNotice(null);
    try {
      const stored = await readSession();
      if (!stored) {
        setStatus('signed-out');
        return;
      }
      const configurationError = checkApiConfiguration();
      if (configurationError) throw new Error(configurationError);
      await loadAgent();
      setStatus('signed-in');
    } catch (cause) {
      if (cause instanceof SessionExpiredError) {
        setNotice(cause.message);
        setStatus('signed-out');
        return;
      }
      setNotice(messageOf(cause, 'Cannot reach SureWina. Check your internet connection.'));
      setStatus('offline');
    }
  }, [loadAgent]);

  useEffect(() => { void restore(); }, [restore]);

  const completeSignIn = useCallback(async (tokens: AgentSession) => {
    await storeSession(tokens);
    try {
      await loadAgent();
      setNotice(null);
      setStatus('signed-in');
    } catch (cause) {
      // Signed in, but the first request failed: keep the session.
      setNotice(messageOf(cause, 'Signed in, but SureWina could not be reached.'));
      setStatus('offline');
    }
  }, [loadAgent]);

  const expire = useCallback((message?: string) => {
    setAgent(null);
    setNotice(message ?? 'Your session expired. Sign in again to continue.');
    setStatus('signed-out');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authorized(async () => {
        const tokens = await readSession();
        await api.agents.signOut(tokens?.refreshToken);
      });
    } catch {
      // Always clear local credentials, including when the network is down.
    } finally {
      await clearSession();
      setAgent(null);
      setNotice(null);
      setStatus('signed-out');
    }
  }, []);

  const value = useMemo(
    () => ({ status, agent, notice, restore, completeSignIn, expire, signOut }),
    [status, agent, notice, restore, completeSignIn, expire, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
