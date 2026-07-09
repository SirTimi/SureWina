import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway as PaymentGatewayEnum } from '@prisma/client';
import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentGatewayDriver,
} from './payment-gateway.interface';

// Shape of the Paystack /transaction/initialize success response (subset).
type PaystackInitResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

@Injectable()
export class PaystackDriver implements PaymentGatewayDriver {
  readonly gateway = PaymentGatewayEnum.PAYSTACK;
  private readonly logger = new Logger(PaystackDriver.name);

  constructor(private readonly config: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      // Config allows an empty key so the app boots; fail loudly only here.
      throw new InternalServerErrorException(
        'Paystack is not configured (PAYSTACK_SECRET_KEY missing)',
      );
    }

    const baseUrl = this.config.getOrThrow<string>('PAYSTACK_BASE_URL');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: input.amountKobo,
          email: input.email,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
          currency: 'NGN',
        }),
      });
    } catch (error) {
      // Network-level failure (DNS, timeout, offline). Gateway is down.
      this.logger.error(
        `Paystack network error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new ServiceUnavailableException('Payment gateway unreachable');
    }

    const payload = (await response
      .json()
      .catch(() => null)) as PaystackInitResponse | null;

    if (!response.ok || !payload?.status || !payload.data) {
      this.logger.error(
        `Paystack init failed (${response.status}): ${
          payload?.message ?? 'no body'
        }`,
      );
      throw new ServiceUnavailableException(
        payload?.message ?? 'Payment initialization failed',
      );
    }

    return {
      authorizationUrl: payload.data.authorization_url,
      gatewayReference: payload.data.reference,
    };
  }
}