import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PaymentGateway } from '@prisma/client';
import { MonnifyClientService } from '../integrations/monnify/monnify-client.service';

export type PaymentVerificationStatus =
  | 'SUCCESS'
  | 'PENDING'
  | 'FAILED';

export type VerifiedProviderPayment = {
  gateway: PaymentGateway;

  reference: string;

  providerTransactionId: string | null;

  status: PaymentVerificationStatus;

  /*
   * Normalised into naira.
   */
  amountNgn: number | null;

  currency: string | null;

  /*
   * Exact provider-confirmed successful payment time,
   * when the provider exposes a timestamp that we can
   * safely treat as the actual payment completion time.
   *
   * Paystack provides paid_at.
   *
   * Flutterwave v3 verification currently does not give
   * us a documented equivalent that we are comfortable
   * using for draw-cutoff eligibility.
   */
  paidAt: Date | null;

  /*
   * The time SureWina successfully observed the provider's
   * independently verified transaction state.
   *
   * This becomes important when the provider does not expose
   * a reliable exact payment completion timestamp.
   */
  verifiedAt: Date;

  metadata: Record<string, unknown> | null;

  raw: unknown;
};

type PaystackVerifyResponse = {
  status?: boolean;

  message?: string;

  data?: {
    id?: number | string;

    status?: string;

    reference?: string;

    /*
     * Paystack returns amount in the currency's
     * minor unit.
     *
     * For NGN:
     * 100 kobo = 1 naira.
     */
    amount?: number;

    currency?: string;

    metadata?:
      | Record<string, unknown>
      | string
      | null;

    /*
     * Paystack's confirmed payment timestamp.
     */
    paid_at?: string | null;
  };
};

type MonnifyVerifyBody = {
  transactionReference?: string;
  paymentReference?: string;
  amountPaid?: number | string;
  totalPayable?: number | string;
  settlementAmount?: number | string;
  paymentStatus?: string;
  paymentMethod?: string;
  currencyCode?: string;
  currency?: string;
  paidOn?: string | null;
  completedOn?: string | null;
  metaData?: Record<string, unknown> | null;
};

type FlutterwaveVerifyResponse = {
  status?: string;

  message?: string;

  data?: {
    id?: number | string;

    tx_ref?: string;

    status?: string;

    /*
     * Flutterwave returns amount in the
     * major currency unit.
     *
     * For NGN this is already naira.
     */
    amount?: number;

    charged_amount?: number;

    currency?: string;

    meta?: Record<string, unknown> | null;
  };
};

@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(
    PaymentVerificationService.name,
  );

  constructor(
    private readonly config: ConfigService,
    private readonly monnify: MonnifyClientService,
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

    const data =
      payload.data;

    /*
     * Capture this after validation so TypeScript knows
     * it is definitely a string.
     */
    const verifiedReference =
      data.reference;

    if (!verifiedReference) {this.logger.warn(`Paystack verification failed for ${reference}: missing reference in response`); return null; }

    const metadata =
      data.metadata &&
      typeof data.metadata === 'object' &&
      !Array.isArray(data.metadata)
        ? data.metadata
        : null;

    /*
     * Paystack amount is returned in kobo.
     */
    const amountNgn =
      typeof data.amount === 'number' &&
      Number.isFinite(data.amount)
        ? data.amount / 100
        : null;

    /*
     * Paystack exposes the exact successful payment
     * timestamp as paid_at.
     */
    const paidAt =
      this.parseDate(
        data.paid_at,
      );

    const verifiedAt =
      new Date();

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
        typeof data.currency === 'string'
          ? data.currency
              .trim()
              .toUpperCase()
          : null,

      paidAt,

      verifiedAt,

      metadata,

      raw:
        payload,
    };
  }

  async verifyMonnify(
    reference: string,
  ): Promise<VerifiedProviderPayment | null> {
    const cleanReference =
      reference.trim();

    if (!cleanReference) {
      return null;
    }

    const result =
      await this.monnify.request<MonnifyVerifyBody>(
        `/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(
          cleanReference,
        )}`,
        {
          method: 'GET',
        },
      );

    const payload =
      result.payload;

    const data =
      payload?.responseBody;

    if (
      !payload?.requestSuccessful ||
      !data?.paymentReference
    ) {
      this.logger.warn(
        `Monnify verification failed for ${cleanReference}: ${
          payload?.responseMessage ??
          `HTTP ${result.httpStatus}`
        }`,
      );

      return null;
    }

    const amountRaw =
      data.amountPaid;

    const amountNgn =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string'
          ? Number(amountRaw)
          : null;

    const currency =
      (
        data.currencyCode ??
        data.currency ??
        ''
      )
        .trim()
        .toUpperCase() ||
      null;

    return {
      gateway:
        PaymentGateway.MONNIFY,

      reference:
        data.paymentReference,

      providerTransactionId:
        data.transactionReference ??
        null,

      status:
        this.mapMonnifyStatus(
          data.paymentStatus,
        ),

      amountNgn:
        amountNgn !== null &&
        Number.isFinite(amountNgn)
          ? amountNgn
          : null,

      currency,

      paidAt:
        this.parseDate(
          data.paidOn ??
          data.completedOn,
        ),

      verifiedAt:
        new Date(),

      metadata:
        data.metaData &&
        typeof data.metaData === 'object' &&
        !Array.isArray(data.metaData)
          ? data.metaData
          : null,

      raw:
        payload,
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

    const data =
      payload.data;

    /*
     * Capture after validation for strict TypeScript
     * narrowing.
     */
    const verifiedReference =
      data.tx_ref;

    if (!verifiedReference) {this.logger.warn(`Flutterwave verification failed for transaction ${transactionId}: missing tx_ref in response`); return null; }

    const metadata =
      data.meta &&
      typeof data.meta === 'object' &&
      !Array.isArray(data.meta)
        ? data.meta
        : null;

    /*
     * Flutterwave amount is already in the major
     * currency unit.
     *
     * For NGN this means naira.
     */
    const amountNgn =
      typeof data.amount === 'number' &&
      Number.isFinite(data.amount)
        ? data.amount
        : null;

    /*
     * Flutterwave v3 does not currently provide us
     * with a documented equivalent of Paystack's
     * exact paid_at field that we are willing to use
     * for draw-cutoff eligibility.
     *
     * Therefore this intentionally remains null.
     */
    const paidAt: Date | null =
      null;

    /*
     * This is when SureWina independently verified
     * Flutterwave's transaction state.
     */
    const verifiedAt =
      new Date();

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

      amountNgn,

      currency:
        typeof data.currency === 'string'
          ? data.currency
              .trim()
              .toUpperCase()
          : null,

      paidAt,

      verifiedAt,

      metadata,

      raw:
        payload,
    };
  }

  private mapPaystackStatus(
    status?: string,
  ): PaymentVerificationStatus {
    switch (
      status
        ?.trim()
        .toLowerCase()
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

  private mapMonnifyStatus(
    status?: string,
  ): PaymentVerificationStatus {
    switch (
      status
        ?.trim()
        .toUpperCase()
    ) {
      case 'PAID':
        return 'SUCCESS';

      case 'FAILED':
      case 'CANCELLED':
      case 'ABANDONED':
      case 'REVERSED':
      case 'EXPIRED':
      case 'REFUNDED':
        return 'FAILED';

      default:
        return 'PENDING';
    }
  }

  private mapFlutterwaveStatus(
    status?: string,
  ): PaymentVerificationStatus {
    switch (
      status
        ?.trim()
        .toLowerCase()
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

  private parseDate(
    value?: string | null,
  ): Date | null {
    if (!value) {
      return null;
    }

    const parsed =
      new Date(value);

    if (
      Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return null;
    }

    return parsed;
  }
}