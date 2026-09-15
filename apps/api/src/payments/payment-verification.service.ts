import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  PaymentGateway,
} from '@prisma/client';

export type PaymentVerificationStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'FAILED';

export type VerifiedProviderPayment = {
  gateway: PaymentGateway;

  reference: string;

  providerTransactionId:
    string | null;

  status:
    PaymentVerificationStatus;

  /*
   * Normalised into naira.
   *
   * SureWina currently prices tickets in whole NGN.
   */
  amountNgn:
    number | null;

  currency:
    string | null;

  metadata:
    Record<string, unknown> | null;

  raw:
    unknown;
};

type PaystackVerifyResponse = {
  status?: boolean;
  message?: string;

  data?: {
    id?: number | string;
    status?: string;
    reference?: string;

    // Paystack returns subunits.
    amount?: number;

    currency?: string;

    metadata?:
      | Record<string, unknown>
      | string
      | null;
  };
};

type FlutterwaveVerifyResponse = {
  status?: string;
  message?: string;

  data?: {
    id?: number | string;

    tx_ref?: string;

    status?: string;

    /*
     * Flutterwave returns the amount in the
     * major currency unit.
     */
    amount?: number;

    charged_amount?: number;

    currency?: string;

    meta?:
      | Record<string, unknown>
      | null;
  };
};

@Injectable()
export class PaymentVerificationService {
  private readonly logger =
    new Logger(
      PaymentVerificationService.name,
    );

  constructor(
    private readonly config:
      ConfigService,
  ) {}

  async verifyPaystack(
    reference: string,
  ): Promise<VerifiedProviderPayment | null> {
    const secretKey =
      this.config.get<string>(
        'PAYSTACK_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Paystack verification is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'PAYSTACK_BASE_URL',
      );

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/transaction/verify/${encodeURIComponent(
          reference,
        )}`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${secretKey}`,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Paystack verification request failed for ${reference}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );

      throw new ServiceUnavailableException(
        'Could not verify Paystack payment',
      );
    }

    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | PaystackVerifyResponse
        | null;

    if (
      !response.ok ||
      !payload?.status ||
      !payload.data?.reference
    ) {
      this.logger.warn(
        `Paystack verification failed for ${reference}: ${
          payload?.message ??
          `HTTP ${response.status}`
        }`,
      );

      return null;
    }

    const verifiedReference = payload.data.reference;

    const data =
      payload.data;

    const metadata =
      data.metadata &&
      typeof data.metadata === 'object' &&
      !Array.isArray(data.metadata)
        ? data.metadata
        : null;

    const amountNgn =
      typeof data.amount === 'number' &&
      Number.isFinite(data.amount)
        ? data.amount / 100
        : null;

    return {
      gateway:
        PaymentGateway.PAYSTACK,

      reference:
        verifiedReference,

      providerTransactionId:
        data.id !== undefined
          ? String(data.id)
          : null,

      status:
        this.mapPaystackStatus(
          data.status,
        ),

      amountNgn,

      currency:
        typeof data.currency ===
        'string'
          ? data.currency.toUpperCase()
          : null,

      metadata,

      raw: payload,
    };
  }

  async verifyFlutterwave(
    transactionId: number | string,
  ): Promise<VerifiedProviderPayment | null> {
    const secretKey =
      this.config.get<string>(
        'FLUTTERWAVE_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'Flutterwave verification is not configured',
      );
    }

    const baseUrl =
      this.config.getOrThrow<string>(
        'FLUTTERWAVE_BASE_URL',
      );

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/v3/transactions/${encodeURIComponent(
          String(transactionId),
        )}/verify`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${secretKey}`,

            'Content-Type':
              'application/json',
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Flutterwave verification request failed for transaction ${transactionId}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );

      throw new ServiceUnavailableException(
        'Could not verify Flutterwave payment',
      );
    }

    const payload =
      (await response
        .json()
        .catch(() => null)) as
        | FlutterwaveVerifyResponse
        | null;

    if (
      !response.ok ||
      payload?.status !== 'success' ||
      !payload.data?.tx_ref
    ) {
      this.logger.warn(
        `Flutterwave verification failed for transaction ${transactionId}: ${
          payload?.message ??
          `HTTP ${response.status}`
        }`,
      );

      return null;
    }

    const verifiedReference = payload.data.tx_ref;

    const data =
      payload.data;

    const metadata =
      data.meta &&
      typeof data.meta === 'object' &&
      !Array.isArray(data.meta)
        ? data.meta
        : null;

    return {
      gateway:
        PaymentGateway.FLUTTERWAVE,

      reference:
        verifiedReference,

      providerTransactionId:
        data.id !== undefined
          ? String(data.id)
          : String(transactionId),

      status:
        this.mapFlutterwaveStatus(
          data.status,
        ),

      amountNgn:
        typeof data.amount === 'number' &&
        Number.isFinite(data.amount)
          ? data.amount
          : null,

      currency:
        typeof data.currency ===
        'string'
          ? data.currency.toUpperCase()
          : null,

      metadata,

      raw: payload,
    };
  }

  private mapPaystackStatus(
    status?: string,
  ): PaymentVerificationStatus {
    switch (
      status?.trim().toLowerCase()
    ) {
      case 'success':
        return 'SUCCESS';

      case 'failed':
      case 'abandoned':
      case 'reversed':
        return 'FAILED';

      default:
        return 'PENDING';
    }
  }

  private mapFlutterwaveStatus(
    status?: string,
  ): PaymentVerificationStatus {
    switch (
      status?.trim().toLowerCase()
    ) {
      case 'successful':
        return 'SUCCESS';

      case 'failed':
      case 'cancelled':
        return 'FAILED';

      default:
        return 'PENDING';
    }
  }
}