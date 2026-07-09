import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaystackDriver } from './gateway/paystack.driver';
import { FlutterwaveDriver } from './gateway/flutterwave.driver';
import { PurchaseConfirmationService } from './purchase-confirmation.service';
import { JackpotAccumulationService } from './jackpot-accumulation.service';
import { PaystackWebhookController } from './webhook/paystack-webhook.controller';
import { PaystackWebhookService } from './webhook/paystack-webhook.service';
import { PaystackSignatureGuard } from './webhook/paystack-signature.guard';
import { FlutterwaveWebhookController } from './webhook/flutterwave-webhook.controller';
import { FlutterwaveWebhookService } from './webhook/flutterwave-webhook.service';
import { FlutterwaveHashGuard } from './webhook/flutterwave-hash.guard';

@Module({
  controllers: [
    PaymentsController,
    PaystackWebhookController,
    FlutterwaveWebhookController,
  ],
  providers: [
    PaymentsService,
    PaystackDriver,
    FlutterwaveDriver,
    PurchaseConfirmationService,
    JackpotAccumulationService,
    PaystackWebhookService,
    PaystackSignatureGuard,
    FlutterwaveWebhookService,
    FlutterwaveHashGuard,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}