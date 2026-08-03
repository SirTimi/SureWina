import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { JwtService } from '@nestjs/jwt';
import { ReceiptService } from './receipt.service';
@Module({
  controllers: [TicketsController],
  providers: [TicketsService, JwtService, ReceiptService],
  exports: [TicketsService, ReceiptService],
})
export class TicketsModule {}