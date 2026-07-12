import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePurchaseDto } from './dto/initiate-purchase.dto';
import { PurchaseStatusService } from './purchase-status.service'
@Controller('tickets/purchase')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly purchaseStatus: PurchaseStatusService
  ) {}

  @Post('initiate')
  initiate(@Body() dto: InitiatePurchaseDto) {
    return this.paymentsService.initiatePurchase(dto);
  }

  @Get('status')
  status(@Query('reference') reference: string) {
    if (!reference?.startsWith('SW-')) {
      throw new BadRequestException('reference is required');
    }
    return this.purchaseStatus.getStatus(reference);
  }
}