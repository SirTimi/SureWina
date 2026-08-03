import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { LookupTicketDto } from './dto/lookup-ticket.dto';
import { CustomerJwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { ReceiptService } from './receipt.service';
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly receipts: ReceiptService,
  ) {}

  // POST (not GET) so ticket refs don't end up in server/proxy access logs.
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: LookupTicketDto) {
    return this.ticketsService.lookup(dto.ticketRef);
  }

  @Get('mine')
  @UseGuards(CustomerJwtGuard)
  listMine(
    @CurrentUser() user: CustomerJwtPayload,
    @Query('filter') filter?: 'active' | 'past' | 'all',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ticketsService.listMine(
      user.phoneNumber,
      filter === 'active' || filter === 'past' ? filter : 'all',
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20)),
    );
  }

  // Public by design: the signed token in the URL is the credential, so a
  // customer can print from their email without signing in.
  @Get('receipt/:token')
  receipt(@Param('token') token: string) {
    return this.receipts.byToken(token);
  }
}