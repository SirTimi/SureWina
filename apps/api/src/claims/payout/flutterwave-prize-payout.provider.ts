import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrizePayoutStatus } from '@prisma/client';

import {
  InitiatePrizePayoutInput,
  PrizePayoutProvider,
  PrizePayoutProviderResult,
} from './prize-payout.provider';

type FlutterwaveTransferRow = {
  id?: number | string;
  account_number?: string;
  bank_code?: string;
  full_name?: string;
  currency?: string;
  debit_currency?: string;
  amount?: number;
  status?: string;
  reference?: string;
  complete_message?: string;
};

type FlutterwaveTransferResponse = {
  status?: string;
  message?: string;
  data?: FlutterwaveTransferRow;
};

type FlutterwaveTransferListResponse = {
  status?: string;
  message?: string;
  data?: FlutterwaveTransferRow[];
};

@Injectable()
export class FlutterwavePrizePayoutProvider
  implements PrizePayoutProvider
{
  readonly providerCode = 'FLUTTERWAVE' as const;

  private readonly logger = new Logger(
    FlutterwavePrizePayoutProvider.name,
  );

  constructor(
    private readonly config: ConfigService,
  ) {}

  async initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult> {
    const { secretKey, baseUrl } = this.configValues();

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/v3/transfers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_bank: input.bankCode,
            account_number: input.accountNumber,
            amount: input.amountNgn,
            currency: 'NGN',
            debit_currency: 'NGN',
            beneficiary_name: input.accountName,
            reference: input.idempotencyKey,
            narration: input.reason.slice(0, 180),
          }),
        },
      );
    } catch (error) {
      this.logger.warn(
        `Flutterwave payout initiation request failed for ${input.idempotencyKey}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      /*
       * A network failure does not prove Flutterwave did not accept
       * the request. Never return FAILED here.
       */
      return {
        provider: this.providerCode,
        reference: input.idempotencyKey,
        status: PrizePayoutStatus.UNKNOWN,
        rawStatus: 'NETWORK_ERROR',
        failureReason:
          'Could not determine whether Flutterwave accepted the payout',
      };
    }

    const payload = (await response
      .json()
      .catch(() => null)) as FlutterwaveTransferResponse | null;

    const data = payload?.data;

    /*
     * Flutterwave can return useful transfer data even when the
     * top-level response reports an error.
     */
    if (data?.reference) {
      return this.fromTransferRow(
        data,
        payload?.message,
      );
    }

    const message =
      payload?.message ??
      `Flutterwave returned HTTP ${response.status}`;

    /*
     * Duplicate references are deliberate in our architecture.
     *
     * If Flutterwave has seen this reference before, query the
     * existing transfer rather than issuing another one.
     */
    if (
      response.status === 409 ||
      message.toLowerCase().includes('already exists') ||
      message.toLowerCase().includes('duplicate')
    ) {
      return this.getStatus(input.idempotencyKey);
    }

    /*
     * Unknown provider response.
     *
     * Do not label this FAILED unless Flutterwave gives us a
     * conclusive transfer record saying FAILED.
     */
    return {
      provider: this.providerCode,
      reference: input.idempotencyKey,
      status: PrizePayoutStatus.UNKNOWN,
      rawStatus: `HTTP_${response.status}`,
      failureReason: message,
    };
  }

  async getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult> {
    const cleanReference = reference.trim();

    if (!cleanReference) {
      throw new InternalServerErrorException(
        'Flutterwave payout reference is required',
      );
    }

    const { secretKey, baseUrl } = this.configValues();

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl}/v3/transfers?reference=${encodeURIComponent(
          cleanReference,
        )}&page=1`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Flutterwave payout status request failed for ${cleanReference}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      return {
        provider: this.providerCode,
        reference: cleanReference,
        status: PrizePayoutStatus.UNKNOWN,
        rawStatus: 'NETWORK_ERROR',
        failureReason:
          'Could not query Flutterwave payout status',
      };
    }

    const payload = (await response
      .json()
      .catch(() => null)) as FlutterwaveTransferListResponse | null;

    if (!response.ok || payload?.status !== 'success') {
      return {
        provider: this.providerCode,
        reference: cleanReference,
        status: PrizePayoutStatus.UNKNOWN,
        rawStatus: `HTTP_${response.status}`,
        failureReason:
          payload?.message ??
          'Could not determine Flutterwave payout state',
      };
    }

    const rows = Array.isArray(payload.data)
      ? payload.data
      : [];

    /*
     * Never accept a different transfer just because Flutterwave
     * returned it in the same page.
     */
    const transfer = rows.find(
      (row) => row.reference === cleanReference,
    );

    if (!transfer) {
      return {
        provider: this.providerCode,
        reference: cleanReference,
        status: PrizePayoutStatus.UNKNOWN,
        rawStatus: 'NOT_FOUND',
        failureReason:
          'Flutterwave did not return a transfer for this reference',
      };
    }

    return this.fromTransferRow(
      transfer,
      payload.message,
    );
  }

  private fromTransferRow(
    transfer: FlutterwaveTransferRow,
    providerMessage?: string,
  ): PrizePayoutProviderResult {
    const reference =
      transfer.reference?.trim();

    if (!reference) {
      throw new InternalServerErrorException(
        'Flutterwave transfer response is missing reference',
      );
    }

    const status =
      this.mapStatus(
        transfer.status,
      );

    return {
      provider: this.providerCode,

      reference,

      providerTransactionId:
        transfer.id !== undefined
          ? String(transfer.id)
          : null,

      status,

      rawStatus:
        transfer.status ??
        'UNKNOWN',

      failureReason:
        status === PrizePayoutStatus.FAILED ||
        status === PrizePayoutStatus.REVERSED
          ? transfer.complete_message ??
            providerMessage ??
            'Flutterwave reported payout failure'
          : undefined,

      amountNgn:
        typeof transfer.amount === 'number' &&
        Number.isFinite(transfer.amount)
          ? transfer.amount
          : null,

      currency:
        typeof transfer.currency === 'string'
          ? transfer.currency.trim().toUpperCase()
          : null,

      destinationBankCode:
        transfer.bank_code?.trim() ?? null,

      destinationAccountLast4:
        transfer.account_number
          ? transfer.account_number.slice(-4)
          : null,
    };
  }

  private mapStatus(
    rawStatus?: string,
  ): PrizePayoutStatus {
    switch (
      rawStatus
        ?.trim()
        .toUpperCase()
    ) {
      case 'NEW':
        return PrizePayoutStatus.SUBMITTED;

      case 'PENDING':
        return PrizePayoutStatus.PROCESSING;

      case 'SUCCESSFUL':
      case 'SUCCESS':
      case 'COMPLETED':
        return PrizePayoutStatus.SUCCEEDED;

      case 'FAILED':
      case 'CANCELLED':
        return PrizePayoutStatus.FAILED;

      case 'REVERSED':
        return PrizePayoutStatus.REVERSED;

      default:
        return PrizePayoutStatus.UNKNOWN;
    }
  }

  private configValues() {
    const secretKey =
      this.config.get<string>(
        'FLUTTERWAVE_SECRET_KEY',
      );

    if (!secretKey) {
      throw new InternalServerErrorException(
        'FLUTTERWAVE_SECRET_KEY is not configured',
      );
    }

    const baseUrl =
      this.config
        .getOrThrow<string>(
          'FLUTTERWAVE_BASE_URL',
        )
        .replace(/\/+$/, '');

    return {
      secretKey,
      baseUrl,
    };
  }
}