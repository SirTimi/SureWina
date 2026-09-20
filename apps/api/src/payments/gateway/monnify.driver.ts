import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  PaymentGateway as PaymentGatewayEnum,
} from '@prisma/client';

import { ConfigService } from '@nestjs/config';

import { MonnifyClientService } from '../../integrations/monnify/monnify-client.service';

import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentGatewayDriver,
} from './payment-gateway.interface';

type MonnifyInitBody = {
  transactionReference?: string;
  paymentReference?: string;
  checkoutUrl?: string;
};

@Injectable()
export class MonnifyDriver implements PaymentGatewayDriver {
  readonly gateway =
    PaymentGatewayEnum.MONNIFY;

  private readonly logger =
    new Logger(MonnifyDriver.name);

  constructor(
    private readonly monnify:
      MonnifyClientService,

    private readonly config:
      ConfigService,
  ) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const contractCode =
      this.config.get<string>(
        'MONNIFY_CONTRACT_CODE',
      );

    if (!contractCode) {
      throw new InternalServerErrorException(
        'Monnify collections are not configured (MONNIFY_CONTRACT_CODE missing)',
      );
    }

    const result =
      await this.monnify.request<MonnifyInitBody>(
        '/api/v1/merchant/transactions/init-transaction',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            amount:
              input.amountKobo /
              100,

            customerEmail:
              input.email,

            paymentReference:
              input.reference,

            paymentDescription:
              'SureWina payment',

            currencyCode:
              'NGN',

            contractCode,

            redirectUrl:
              input.callbackUrl,

            paymentMethods: [
              'CARD',
              'ACCOUNT_TRANSFER',
              'USSD',
              'PHONE_NUMBER',
            ],

            metadata:
              input.metadata,
          }),
        },
      );

    const payload =
      result.payload;

    const body =
      payload?.responseBody;

    if (
      !payload?.requestSuccessful ||
      !body?.checkoutUrl ||
      !body.paymentReference
    ) {
      this.logger.error(
        `Monnify collection init failed (${result.httpStatus}): ${payload?.responseMessage ?? 'no body'}`,
      );

      throw new ServiceUnavailableException(
        payload?.responseMessage ??
          'Monnify payment initialization failed',
      );
    }

    if (
      body.paymentReference !==
      input.reference
    ) {
      throw new ConflictException(
        'Monnify returned an unexpected payment reference',
      );
    }

    return {
      authorizationUrl:
        body.checkoutUrl,

      gatewayReference:
        body.paymentReference,
    };
  }
}
