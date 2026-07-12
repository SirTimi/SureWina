import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { JwtService } from '@nestjs/jwt';
@Module({
  controllers: [TicketsController],
  providers: [TicketsService, JwtService],
  exports: [TicketsService],
})
export class TicketsModule {}