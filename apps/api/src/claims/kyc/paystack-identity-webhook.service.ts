
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  PaystackEvent,
} from '../../payments/webhook/paystack-webhook.service';

@Injectable()
export class PaystackIdentityWebhookService {
  async handleWebhook(
    _event: PaystackEvent,
  ): Promise<void> {
    // Phase 2D will implement authenticated event
    // correlation, persistence and idempotency here.
    //
    // Never mark a customer verified until then.
    throw new ServiceUnavailableException(
      'Paystack identity verification handler is not ready',
    );
  }
}
