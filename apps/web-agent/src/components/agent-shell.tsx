'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import type { AgentMe } from '@surewina/types';
import { AgentHeader } from '@/components/agent-header';
import { clearAgentSession } from '@/lib/agent-auth';
import { api } from '@/lib/api';
import { discardLegacyOfflineSales, isOnline } from '@/lib/network-status';

interface AgentShellProps {
  children: (agent: AgentMe) => React.ReactNode;
}

export function AgentShell({ children }: AgentShellProps) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentMe | null>(null);
  const [checking, setChecking] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // The server is the only authority on who is signed in. The token in
    // storage is sent by the client core; a cached agent object must never
    // bypass this check.
    api.agents
      .getMe()
      .then((res) => {
        setAgent(res.agent);
      })
      .catch(() => {
        clearAgentSession();
        router.replace('/sign-in');
      })
      .finally(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    discardLegacyOfflineSales();
    setOnline(isOnline());

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

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

      {!online && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
          <div className="mx-auto flex max-w-[1180px] items-center gap-2 text-xs font-bold text-amber-900">
            <WifiOff className="h-3.5 w-3.5" />
            You are offline. Prepaid ticket sales require a live wallet check and cannot be completed until you reconnect.
          </div>
        </div>
      )}


      {children(agent)}
    </div>
  );
}