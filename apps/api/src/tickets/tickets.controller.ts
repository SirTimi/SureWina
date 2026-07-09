import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { LookupTicketDto } from './dto/lookup-ticket.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // POST (not GET) so ticket refs don't end up in server/proxy access logs.
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: LookupTicketDto) {
    return this.ticketsService.lookup(dto.ticketRef);
  }
}