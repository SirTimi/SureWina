'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Clock, Trophy } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Tabs } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DashboardTicket } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';
import { Inbox } from 'lucide-react';

type Filter = 'active' | 'past';

interface TicketsListViewProps {
  initialFilter: Filter;
}

interface DrawGroup {
  drawCode: string;
  drawType: DashboardTicket['drawType'];
  drawPrizeDescription: string;
  drawScheduledAt: string;
  awaitingDraw: boolean;
  tickets: DashboardTicket[];
  /** True if any ticket in the group is a winner. */
  hasWinner: boolean;
}

function groupTicketsByDraw(tickets: DashboardTicket[]): DrawGroup[] {
  const groups = new Map<string, DrawGroup>();
  for (const t of tickets) {
    let g = groups.get(t.drawCode);
    if (!g) {
      g = {
        drawCode: t.drawCode,
        drawType: t.drawType,
        drawPrizeDescription: t.drawPrizeDescription,
        drawScheduledAt: t.drawScheduledAt,
        awaitingDraw: t.awaitingDraw,
        tickets: [],
        hasWinner: false,
      };
      groups.set(t.drawCode, g);
    }
    g.tickets.push(t);
    if (t.isWinner) g.hasWinner = true;
  }
  return Array.from(groups.values()).sort((a, b) =>
    b.drawScheduledAt.localeCompare(a.drawScheduledAt),
  );
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'drawing soon';
  const totalMins = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const minutes = totalMins % 60;
  if (days >= 1) return `closes in ${days}d ${hours}h`;
  if (hours >= 1) return `closes in ${hours}h ${minutes}m`;
  return `closes in ${minutes}m`;
}

export function TicketsListView({ initialFilter }: TicketsListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [tickets, setTickets] = useState<DashboardTicket[] | null>(null);
  const [counts, setCounts] = useState<{ active: number; past: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTickets(null);
    api.dashboard
      .listMyTickets({ filter, pageSize: 100 })
      .then((res) => setTickets(res.tickets))
      .catch((err) => setError(err.message ?? 'Could not load tickets.'));
  }, [filter]);

  useEffect(() => {
    Promise.all([
      api.dashboard.listMyTickets({ filter: 'active', pageSize: 1 }),
      api.dashboard.listMyTickets({ filter: 'past', pageSize: 1 }),
    ])
      .then(([a, p]) => setCounts({ active: a.total, past: p.total }))
      .catch(() => undefined);
  }, []);

  const handleFilterChange = (id: string) => {
    const next = id as Filter;
    setFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'active') {
      params.delete('filter');
    } else {
      params.set('filter', next);
    }
    const qs = params.toString();
    router.replace(`/dashboard/tickets${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  if (error) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-danger font-medium">{error}</p>
      </Card>
    );
  }

  const groups = tickets ? groupTicketsByDraw(tickets) : null;

  return (
    <>
      <Tabs
        items={[
          { id: 'active', label: 'Active', count: counts?.active },
          { id: 'past', label: 'Past', count: counts?.past },
        ]}
        activeId={filter}
        onChange={handleFilterChange}
        className="mb-6"
      />

      {!groups ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-ink-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card variant="default">
          <EmptyState
            icon={<Inbox className="w-12 h-12" />}
            title={filter === 'active' ? 'No active tickets' : 'No past tickets yet'}
            description={
              filter === 'active'
                ? "You don't have any tickets in upcoming draws. Buy a ticket to get started."
                : "You haven't played any past draws yet. Active tickets will move here after their draw."
            }
            action={
              filter === 'active' ? (
                <Link href="/">
                  <Button variant="primary">Browse active draws</Button>
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isJackpot = group.drawType === 'SATURDAY_JACKPOT';
            return (
              <Card key={group.drawCode} variant="default" className="overflow-hidden">
                <Link
                  href={`/dashboard/tickets/${group.tickets[0].ticketRef}`}
                  className="block p-5 hover:bg-ink-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
                          {drawTypeShortLabel[group.drawType]}
                        </Badge>
                        {group.hasWinner && (
                          <Badge variant="verified" withDot>
                            Winning ticket
                          </Badge>
                        )}
                        {group.awaitingDraw && !group.hasWinner && (
                          <Badge variant="live" withDot>
                            Awaiting draw
                          </Badge>
                        )}
                        {!group.awaitingDraw && !group.hasWinner && (
                          <Badge variant="closed">Did not win</Badge>
                        )}
                      </div>
                      <p className="font-display font-semibold text-ink-950 truncate">
                        {group.drawPrizeDescription}
                      </p>
                      <p className="text-sm text-ink-500 mt-1">
                        <span className="tabular-nums font-medium text-ink-700">
                          {group.tickets.length}
                        </span>{' '}
                        ticket{group.tickets.length === 1 ? '' : 's'}
                        <span className="mx-1.5 text-ink-300">·</span>
                        {formatDrawDate(group.drawScheduledAt)} ·{' '}
                        {formatDrawTime(group.drawScheduledAt)}
                        {group.awaitingDraw && (
                          <>
                            <span className="mx-1.5 text-ink-300">·</span>
                            <span className="inline-flex items-center gap-1 text-ink-700">
                              <Clock className="w-3 h-3" />
                              {formatCountdown(group.drawScheduledAt)}
                            </span>
                          </>
                        )}
                      </p>

                      {/* Ticket refs preview */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {group.tickets.slice(0, 4).map((t) => (
                          <span
                            key={t.ticketRef}
                            className="inline-block bg-ink-50 border border-ink-100 rounded px-2 py-0.5 text-xs font-mono text-ink-700"
                          >
                            {t.ticketRef}
                          </span>
                        ))}
                        {group.tickets.length > 4 && (
                          <span className="inline-block px-2 py-0.5 text-xs text-ink-500">
                            + {group.tickets.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="hidden sm:inline-block text-sm text-ink-500">
                        {formatNaira(
                          group.tickets.reduce((sum, t) => sum + t.faceValueNgn, 0),
                        )}
                      </span>
                      {group.hasWinner ? (
                        <Trophy className="w-5 h-5 text-amber-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-ink-300" />
                      )}
                    </div>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}