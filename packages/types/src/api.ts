import type { DrawPublic, DrawResultPublic } from './draws.js';
import type { TicketPublic } from './tickets.js';

export interface ListActiveDrawsResponse {
  draws: DrawPublic[];
}

export interface GetDrawResponse {
  draw: DrawPublic;
  ticketsSold: number;
  prizePoolNgn: number;
  jackpotEligible: boolean;
}

export interface ListPastResultsRequest {
  page?: number;
  pageSize?: number;
  drawType?: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  fromDate?: string;
  toDate?: string;
}

export interface ListPastResultsResponse {
  results: DrawResultPublic[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetResultDetailResponse {
  result: DrawResultPublic;
  drawDescription: string;
  prizeImageUrl: string | null;
}

export interface LookupTicketRequest {
  ticketRef: string;
}

export interface LookupTicketResponse {
  ticket: TicketPublic;
  isWinner: boolean;
  claimUrl: string | null;
}

export interface RecentWinnerStat {
  drawDate: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  prizeValueNgn: number;
  prizeDescription: string;
  winnerStateCode: string;
  winnerTicketRef: string;
}

export interface RecentStatsResponse {
  recentWinners: RecentWinnerStat[];
  totalWinnersAllTime: number;
  totalPrizesPaidNgn: number;
}