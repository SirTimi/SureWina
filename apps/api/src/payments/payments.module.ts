import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackDriver } from './gateway/paystack.driver';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { PaystackWebhookController } from './webhook/paystack-webhook.controller';
import { PaystackWebhookService } from './webhook/paystack-webhook.service';
import { PaystackSignatureGuard } from './webhook/paystack-signature.guard';
import { JackpotAccumulationService } from './jackpot-accumulation.service';
@Module({
  controllers: [PaymentsController, PaystackWebhookController],
  providers: [
    PaymentsService,
    PaystackDriver,
    PaystackWebhookService,
    PaystackSignatureGuard,
    JackpotAccumulationService,
    { provide: PAYMENT_GATEWAY, useExisting: PaystackDriver },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}