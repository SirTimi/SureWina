'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentMe } from '@surewina/types';
import { AgentHeader } from '@/components/agent-header';
import { getStoredAgent, saveAgentSession } from '@/lib/agent-auth';
import { api } from '@/lib/api';

interface AgentShellProps {
  children: (agent: AgentMe) => React.ReactNode;
}

export function AgentShell({ children }: AgentShellProps) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentMe | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = getStoredAgent();

    if (stored) {
      setAgent(stored);
      setChecking(false);
      return;
    }

    api.agents
      .getMe()
      .then((res) => {
        setAgent(res.agent);
        saveAgentSession({
          agent: res.agent,
          accessToken: 'mock_agent_access_existing',
          refreshToken: 'mock_agent_refresh_existing',
        });
      })
      .catch(() => {
        router.replace('/sign-in');
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <main className="min-h-screen bg-[#F8FAF4] p-4">
        <div className="mx-auto max-w-[1180px] pt-8">
          <div className="h-16 animate-pulse rounded-2xl bg-white" />
          <div className="mt-4 h-48 animate-pulse rounded-3xl bg-white" />
        </div>
      </main>
    );
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen bg-[#F8FAF4]">
      <AgentHeader agent={agent} />
      {children(agent)}
    </div>
  );
}