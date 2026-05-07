'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Inbox,
  Search,
  Ticket,
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

    if (t.isWinner) {
      g.hasWinner = true;
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
  const [query, setQuery] = useState('');

  useEffect(() => {
    setTickets(null);
    setError(null);

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
        className="rounded-3xl border-red-100 bg-white p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
        <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
      </Card>
    );
  }

  const groups = tickets ? groupTicketsByDraw(tickets) : null;

  const filteredGroups =
    groups?.filter((group) => {
      const q = query.trim().toLowerCase();

      if (!q) return true;

      return (
        group.drawCode.toLowerCase().includes(q) ||
        group.drawPrizeDescription.toLowerCase().includes(q) ||
        group.tickets.some((ticket) => ticket.ticketRef.toLowerCase().includes(q))
      );
    }) ?? null;

  const totalTicketValue =
    tickets?.reduce((sum, ticket) => sum + ticket.faceValueNgn, 0) ?? 0;

  const winnerCount = tickets?.filter((ticket) => ticket.isWinner).length ?? 0;

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <TicketStat
          icon={<Ticket className="h-5 w-5" />}
          label={filter === 'active' ? 'Active ticket count' : 'Past ticket count'}
          value={(tickets?.length ?? counts?.[filter] ?? 0).toLocaleString()}
          hint={filter === 'active' ? 'Still in upcoming draws' : 'Already drawn'}
        />

        <TicketStat
          icon={<CalendarDays className="h-5 w-5" />}
          label="Grouped draws"
          value={(groups?.length ?? 0).toLocaleString()}
          hint="Tickets grouped by draw"
        />

        <TicketStat
          icon={<Trophy className="h-5 w-5" />}
          label={filter === 'past' ? 'Winning tickets' : 'Ticket value'}
          value={filter === 'past' ? winnerCount.toLocaleString() : formatNaira(totalTicketValue)}
          hint={filter === 'past' ? 'Past winning references' : 'Total face value'}
          highlighted={filter === 'past' && winnerCount > 0}
        />
      </div>

      <Card
        variant="default"
        className="mb-6 rounded-3xl border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.04)]"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-full rounded-sm border border-[#4E8F01]/15 bg-[#F8FAF4] p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => handleFilterChange('active')}
              className={
                filter === 'active'
                  ? 'flex-1 rounded-sm bg-[#4E8F01] px-4 py-2.5 text-sm font-bold text-white shadow-sm sm:flex-none'
                  : 'flex-1 rounded-sm px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#A8E368]/15 hover:text-[#4E8F01] sm:flex-none'
              }
            >
              Active
              {counts?.active !== undefined && (
                <span className="ml-2 font-mono text-xs opacity-80">{counts.active}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange('past')}
              className={
                filter === 'past'
                  ? 'flex-1 rounded-sm bg-[#4E8F01] px-4 py-2.5 text-sm font-bold text-white shadow-sm sm:flex-none'
                  : 'flex-1 rounded-sm px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-[#A8E368]/15 hover:text-[#4E8F01] sm:flex-none'
              }
            >
              Past
              {counts?.past !== undefined && (
                <span className="ml-2 font-mono text-xs opacity-80">{counts.past}</span>
              )}
            </button>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4E8F01]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket ref or prize..."
              className="h-11 w-full rounded-sm border border-slate-200 bg-white pl-10 pr-3 text-sm text-navy-950 outline-none transition placeholder:text-slate-400 focus:border-[#4E8F01] focus:ring-2 focus:ring-[#A8E368]/35"
            />
          </div>
        </div>
      </Card>

      {!filteredGroups ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-white" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyTicketsState filter={filter} hasSearch={query.trim().length > 0} />
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <TicketGroupCard key={group.drawCode} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketGroupCard({ group }: { group: DrawGroup }) {
  const isJackpot = group.drawType === 'SATURDAY_JACKPOT';
  const totalValue = group.tickets.reduce((sum, t) => sum + t.faceValueNgn, 0);
  const firstTicket = group.tickets[0];

  return (
    <Card
      variant="default"
      className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
    >
      <Link
        href={`/dashboard/tickets/${firstTicket.ticketRef}`}
        className="block p-5 sm:p-6"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
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

            <p className="truncate font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
              {group.drawPrizeDescription}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span>
                {formatDrawDate(group.drawScheduledAt)} ·{' '}
                {formatDrawTime(group.drawScheduledAt)}
              </span>

              {group.awaitingDraw && (
                <span className="inline-flex items-center gap-1 font-bold text-[#4E8F01]">
                  <Clock className="h-3.5 w-3.5" />
                  {formatCountdown(group.drawScheduledAt)}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {group.tickets.slice(0, 5).map((t) => (
                <span
                  key={t.ticketRef}
                  className={
                    t.isWinner
                      ? 'inline-flex items-center rounded-sm border border-[#4E8F01]/20 bg-[#A8E368]/25 px-2.5 py-1 font-mono text-xs font-bold text-[#4E8F01]'
                      : 'inline-flex items-center rounded-sm border border-slate-200 bg-[#F8FAF4] px-2.5 py-1 font-mono text-xs font-bold text-slate-600'
                  }
                >
                  {t.ticketRef}
                </span>
              ))}

              {group.tickets.length > 5 && (
                <span className="inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-bold text-slate-500">
                  +{group.tickets.length - 5} more
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#4E8F01]/15 bg-[#F8FAF4] p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                  Tickets
                </p>
                <p className="mt-1 font-display text-2xl font-black text-navy-950 tabular-nums">
                  {group.tickets.length}
                </p>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4E8F01]">
                  Value
                </p>
                <p className="mt-1 font-display text-2xl font-black text-navy-950 tabular-nums">
                  {formatNaira(totalValue)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[#4E8F01]/10 pt-3 text-sm font-bold text-[#4E8F01]">
              View ticket
              {group.hasWinner ? (
                <Trophy className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>
          </div>
        </div>
      </Link>
    </Card>
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
      className="rounded-3xl border-slate-200 bg-white p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#A8E368]/35 text-[#4E8F01]">
        <Inbox className="h-7 w-7" />
      </div>

      <h2 className="mt-4 font-display text-2xl font-black tracking-[-0.03em] text-navy-950">
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
            ? "You don't have any tickets in upcoming draws. Buy a ticket to get started."
            : 'Past tickets will appear here after their draw has completed.'}
      </p>

      {!hasSearch && filter === 'active' && (
        <Link href="/draws" className="mt-6 inline-block">
          <Button
            variant="accent"
            className="rounded-sm !border-transparent bg-[#A8E368] font-bold text-navy-950 hover:!border-transparent hover:bg-[#B7EF79]"
          >
            Browse active draws
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      )}
    </Card>
  );
}

function TicketStat({
  icon,
  label,
  value,
  hint,
  highlighted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  highlighted?: boolean;
}) {
  return (
    <Card
      variant="default"
      className={
        highlighted
          ? 'rounded-2xl border-[#4E8F01]/20 bg-[#A8E368]/15 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]'
          : 'rounded-2xl border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.04)]'
      }
    >
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-[#A8E368]/35 text-[#4E8F01]">
        {icon}
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4E8F01]">
        {label}
      </p>

      <p className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-navy-950 tabular-nums">
        {value}
      </p>

      <p className="mt-2 text-sm leading-relaxed text-slate-500">{hint}</p>
    </Card>
  );
}