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

type FlwInitResponse = {
  status: string; // 'success' | 'error'
  message: string;
  data?: { link: string };
};

@Injectable()
export class FlutterwaveDriver implements PaymentGatewayDriver {
  readonly gateway = PaymentGatewayEnum.FLUTTERWAVE;
  private readonly logger = new Logger(FlutterwaveDriver.name);

  constructor(private readonly config: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const secretKey = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    if (!secretKey) {
      throw new InternalServerErrorException(
        'Flutterwave is not configured (FLUTTERWAVE_SECRET_KEY missing)',
      );
    }

    const baseUrl = this.config.getOrThrow<string>('FLUTTERWAVE_BASE_URL');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v3/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: input.reference,
          // Flutterwave charges in NAIRA, not kobo — convert at the boundary.
          amount: input.amountKobo / 100,
          currency: 'NGN',
          redirect_url: input.callbackUrl,
          customer: { email: input.email },
          meta: input.metadata,
        }),
      });
    } catch (error) {
      this.logger.error(
        `Flutterwave network error: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new ServiceUnavailableException('Payment gateway unreachable');
    }

    const payload = (await response
      .json()
      .catch(() => null)) as FlwInitResponse | null;

    if (!response.ok || payload?.status !== 'success' || !payload.data?.link) {
      this.logger.error(
        `Flutterwave init failed (${response.status}): ${payload?.message ?? 'no body'}`,
      );
      throw new ServiceUnavailableException(
        payload?.message ?? 'Payment initialization failed',
      );
    }

    return {
      authorizationUrl: payload.data.link,
      // Flutterwave echoes our tx_ref back on the webhook.
      gatewayReference: input.reference,
    };
  }
}