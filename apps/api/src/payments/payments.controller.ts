import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePurchaseDto } from './dto/initiate-purchase.dto';

@Controller('tickets/purchase')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  initiate(@Body() dto: InitiatePurchaseDto) {
    return this.paymentsService.initiatePurchase(dto);
  }
}