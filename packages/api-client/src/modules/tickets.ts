import type { LookupTicketRequest, LookupTicketResponse } from '@surewina/types';
import type { ApiClient } from '../client.js';
import { MOCK_TICKET_BY_REF } from './mock-data.js';

export class TicketsModule {
  constructor(private readonly client: ApiClient) {}

  async lookup(req: LookupTicketRequest): Promise<LookupTicketResponse> {
    // TODO Phase 6+: return this.client.post('/tickets/lookup', req);
    const ticket = MOCK_TICKET_BY_REF[req.ticketRef.toUpperCase()];
    if (!ticket) throw new Error(`Ticket not found: ${req.ticketRef}`);
    return Promise.resolve(ticket);
  }
}