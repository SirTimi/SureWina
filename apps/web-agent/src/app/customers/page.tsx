'use client';

import { useEffect, useMemo, useState } from 'react';
import { Phone, Search, ShieldOff } from 'lucide-react';
import { Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import { AgentShell } from '@/components/agent-shell';
import { SectionHeading } from '@/components/section-heading';
import { agentMock, type AgentCustomer } from '@/lib/agent-mock';

export default function CustomersPage() {
  return (
    <AgentShell>
      {() => <CustomersBody />}
    </AgentShell>
  );
}

function CustomersBody() {
  const [items, setItems] = useState<AgentCustomer[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    agentMock.listCustomers().then(setItems);
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim();
    if (!q) return items;
    return items.filter((c) => c.phoneE164.includes(q));
  }, [items, query]);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-10 pt-5">
      <SectionHeading
        eyebrow="Customers"
        title="Customers you've sold to"
        description="Phone numbers customers chose to share, with their lifetime sales with you."
        backHref="/"
      />

      <Card className="rounded-3xl border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by phone…"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-navy-950 outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
          />
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {!filtered ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />
          ))
        ) : filtered.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <ShieldOff className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              No customers yet. Ask buyers if they would like an SMS receipt — their
              phone shows up here.
            </p>
          </Card>
        ) : (
          filtered.map((c) => (
            <Card
              key={c.phoneE164}
              className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-navy-50 text-navy-700">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-black text-navy-950">
                      {maskPhone(c.phoneE164)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {c.ticketCount} tickets · Last seen{' '}
                      {timeAgo(c.lastSaleAt)}
                    </p>
                  </div>
                </div>
                <p className="font-display text-sm font-black text-navy-950 tabular-nums">
                  {formatNaira(c.totalSpendNgn)}
                </p>
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}

function maskPhone(p: string) {
  if (p.length <= 7) return p;
  return p.slice(0, 6) + ' *** ' + p.slice(-4);
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
