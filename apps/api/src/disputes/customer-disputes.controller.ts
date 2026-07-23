import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DisputeCategory, DisputeRaisedByType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { CustomerJwtPayload } from '../auth/auth.types';
import { DisputesService } from './disputes.service';


class RaiseDisputeDto {
  @IsEnum(DisputeCategory) category!: DisputeCategory;
  @IsString() @Length(10, 2000) subject!: string;
  @IsOptional() @IsString() ticketRef?: string;
  @IsOptional() @IsString() paymentTxnId?: string;
  @IsOptional() @IsString() claimId?: string;
}

@Controller('disputes')
@UseGuards(CustomerJwtGuard)
export class CustomerDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  listMine(@CurrentUser() user: CustomerJwtPayload) {
    return this.disputes.listForCustomer(user.phoneNumber);
  }

  @Post()
  raise(@Body() dto: RaiseDisputeDto, @CurrentUser() user: CustomerJwtPayload) {
    return this.disputes.create({
      category: dto.category,
      subject: dto.subject,
      customerPhone: user.phoneNumber,
      raisedBy: { type: DisputeRaisedByType.CUSTOMER, id: user.phoneNumber },
      ticketRef: dto.ticketRef,
      paymentTxnId: dto.paymentTxnId,
      claimId: dto.claimId,
    });
  }
}