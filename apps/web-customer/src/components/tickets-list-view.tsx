'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Clock,
  Inbox,
  Search,
  Trophy,
} from 'lucide-react';
import { Badge, Button, Card } from '@surewina/ui';
import { formatNaira } from '@surewina/utils';
import type { DashboardTicket } from '@surewina/types';
import { api } from '@/lib/api';
import { drawTypeShortLabel, formatDrawDate, formatDrawTime } from '@/lib/draw-helpers';

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
  hasWinner: boolean;
}

function groupTicketsByDraw(tickets: DashboardTicket[]): DrawGroup[] {
  const groups = new Map<string, DrawGroup>();

  for (const ticket of tickets) {
    let group = groups.get(ticket.drawCode);

    if (!group) {
      group = {
        drawCode: ticket.drawCode,
        drawType: ticket.drawType,
        drawPrizeDescription: ticket.drawPrizeDescription,
        drawScheduledAt: ticket.drawScheduledAt,
        awaitingDraw: ticket.awaitingDraw,
        tickets: [],
        hasWinner: false,
      };

      groups.set(ticket.drawCode, group);
    }

    group.tickets.push(ticket);

    if (ticket.isWinner) {
      group.hasWinner = true;
    }
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

  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;

  return `${minutes}m`;
}

export function TicketsListView({ initialFilter }: TicketsListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [tickets, setTickets] = useState<DashboardTicket[] | null>(null);
  const [currentTotal, setCurrentTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ active: number; past: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setTickets(null);
    setCurrentTotal(null);
    setError(null);

    api.dashboard
      .listMyTickets({ filter, pageSize: 100 })
      .then((res) => {
        setTickets(res.tickets);
        setCurrentTotal(res.total);
      })
      .catch((err) => setError(err.message ?? 'Could not load tickets.'));
  }, [filter]);

  useEffect(() => {
    Promise.all([
      api.dashboard.listMyTickets({ filter: 'active', pageSize: 1 }),
      api.dashboard.listMyTickets({ filter: 'past', pageSize: 1 }),
    ])
      .then(([active, past]) => setCounts({ active: active.total, past: past.total }))
      .catch(() => undefined);
  }, []);

  const groups = useMemo(() => (tickets ? groupTicketsByDraw(tickets) : null), [tickets]);

  const filteredGroups = useMemo(() => {
    if (!groups) return null;

    const q = query.trim().toLowerCase();

    if (!q) return groups;

    return groups.filter((group) => {
      return (
        group.drawCode.toLowerCase().includes(q) ||
        group.drawPrizeDescription.toLowerCase().includes(q) ||
        group.tickets.some((ticket) => ticket.ticketRef.toLowerCase().includes(q))
      );
    });
  }, [groups, query]);

  const handleFilterChange = (next: Filter) => {
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
      <Card
        variant="default"
        className="rounded-2xl border-red-100 bg-white p-6 text-center shadow-sm"
      >
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
      </Card>
    );
  }

  const visibleCount = filteredGroups?.length ?? 0;
  const accurateTicketCount = currentTotal ?? counts?.[filter] ?? 0;

  return (
    <div>
      <Card
        variant="default"
        className="mb-4 rounded-2xl border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => handleFilterChange('active')}
                className={
                  filter === 'active'
                    ? 'rounded-md bg-white px-4 py-2 text-sm font-bold text-navy-950 shadow-sm'
                    : 'rounded-md px-4 py-2 text-sm font-bold text-slate-500 transition hover:text-navy-950'
                }
              >
                Active
                {counts?.active !== undefined && (
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    {counts.active}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleFilterChange('past')}
                className={
                  filter === 'past'
                    ? 'rounded-md bg-white px-4 py-2 text-sm font-bold text-navy-950 shadow-sm'
                    : 'rounded-md px-4 py-2 text-sm font-bold text-slate-500 transition hover:text-navy-950'
                }
              >
                Past
                {counts?.past !== undefined && (
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    {counts.past}
                  </span>
                )}
              </button>
            </div>

            <p className="text-sm text-slate-500">
              <span className="font-mono font-bold text-navy-950">
                {accurateTicketCount.toLocaleString()}
              </span>{' '}
              {filter} ticket{accurateTicketCount === 1 ? '' : 's'}
              {query.trim() && (
                <>
                  {' '}
                  · showing{' '}
                  <span className="font-mono font-bold text-navy-950">
                    {visibleCount.toLocaleString()}
                  </span>{' '}
                  matching draw{visibleCount === 1 ? '' : 's'}
                </>
              )}
            </p>
          </div>

          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket ref or prize..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-navy-950 outline-none transition placeholder:text-slate-400 focus:border-navy-700 focus:ring-2 focus:ring-amber-400/25"
            />
          </div>
        </div>
      </Card>

      {!filteredGroups ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                i < 3
                  ? 'h-24 animate-pulse border-b border-slate-100 bg-white'
                  : 'h-24 animate-pulse bg-white'
              }
            />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyTicketsState filter={filter} hasSearch={query.trim().length > 0} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filteredGroups.map((group, index) => (
            <TicketRow
              key={group.drawCode}
              group={group}
              isLast={index === filteredGroups.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({ group, isLast }: { group: DrawGroup; isLast: boolean }) {
  const isJackpot = group.drawType === 'SATURDAY_JACKPOT';
  const totalValue = group.tickets.reduce((sum, ticket) => sum + ticket.faceValueNgn, 0);
  const firstTicket = group.tickets[0];

  return (
    <Link
      href={`/dashboard/tickets/${firstTicket.ticketRef}`}
      className={
        isLast
          ? 'block bg-white px-4 py-3.5 transition hover:bg-[#F8FAF4]'
          : 'block border-b border-slate-100 bg-white px-4 py-3.5 transition hover:bg-[#F8FAF4]'
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_24px] md:items-center">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant={isJackpot ? 'jackpot' : 'daily'}>
              {drawTypeShortLabel[group.drawType]}
            </Badge>

            {group.hasWinner && (
              <Badge variant="verified" withDot>
                Winner
              </Badge>
            )}

            {group.awaitingDraw && !group.hasWinner && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-navy-700">
                <Clock className="h-3 w-3" />
                {formatCountdown(group.drawScheduledAt)}
              </span>
            )}

            {!group.awaitingDraw && !group.hasWinner && (
              <span className="text-xs font-medium text-slate-400">Closed</span>
            )}
          </div>

          <p className="truncate font-display text-[15px] font-black text-navy-950">
            {group.drawPrizeDescription}
          </p>

          <p className="mt-0.5 text-xs text-slate-500">
            {group.tickets.length} ticket{group.tickets.length === 1 ? '' : 's'} ·{' '}
            {formatDrawDate(group.drawScheduledAt)} · {formatDrawTime(group.drawScheduledAt)}
          </p>

          <div className="mt-2 flex flex-wrap gap-1">
            {group.tickets.slice(0, 3).map((ticket) => (
              <span
                key={ticket.ticketRef}
                className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600"
              >
                {ticket.ticketRef}
              </span>
            ))}

            {group.tickets.length > 3 && (
              <span className="px-1 py-0.5 text-[10px] font-semibold text-slate-400">
                +{group.tickets.length - 3} more
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 md:block md:text-right">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              Value
            </p>
            <p className="mt-0.5 font-display text-base font-black text-navy-950">
              {formatNaira(totalValue)}
            </p>
          </div>

          {group.hasWinner && (
            <Trophy className="h-4 w-4 text-navy-700 md:ml-auto md:mt-1.5" />
          )}
        </div>

        <ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" />
      </div>
    </Link>
  );
}

function EmptyTicketsState({
  filter,
  hasSearch,
}: {
  filter: Filter;
  hasSearch: boolean;
}) {
  return (
    <Card
      variant="default"
      className="rounded-2xl border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="h-5 w-5" />
      </div>

      <h2 className="mt-4 font-display text-xl font-black text-navy-950">
        {hasSearch
          ? 'No matching tickets'
          : filter === 'active'
            ? 'No active tickets'
            : 'No past tickets yet'}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        {hasSearch
          ? 'Try another ticket reference, prize name, or draw code.'
          : filter === 'active'
            ? "You don't have tickets in upcoming draws yet."
            : 'Past tickets will appear here after their draw is completed.'}
      </p>

      {!hasSearch && filter === 'active' && (
        <Link href="/draws" className="mt-5 inline-block">
          <Button
            variant="accent"
            className="rounded-sm !border-transparent bg-amber-500 font-bold text-navy-950 hover:!border-transparent hover:bg-amber-400"
          >
            Browse active draws
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      )}
    </Card>
  );
}