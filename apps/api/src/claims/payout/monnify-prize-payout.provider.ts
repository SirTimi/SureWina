import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { PrizePayoutStatus } from '@prisma/client';

import { MonnifyClientService } from '../../integrations/monnify/monnify-client.service';

import {
  InitiatePrizePayoutInput,
  PrizePayoutProvider,
  PrizePayoutProviderResult,
} from './prize-payout.provider';

type MonnifyTransferBody = {
  amount?: number;
  reference?: string;
  status?: string;
  transactionReference?: string;
  transactionDescription?: string;
  currency?: string;

  destinationAccountNumber?: string;
  destinationAccountName?: string;
  destinationBankCode?: string;
  destinationBankName?: string;
};

@Injectable()
export class MonnifyPrizePayoutProvider
  implements PrizePayoutProvider
{
  readonly providerCode = 'MONNIFY' as const;

  constructor(
    private readonly monnify: MonnifyClientService,
    private readonly config: ConfigService,
  ) {}

  async initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult> {
    const sourceAccountNumber =
      this.config.get<string>(
        'MONNIFY_SOURCE_ACCOUNT_NUMBER',
      );

    if (!sourceAccountNumber) {
      throw new InternalServerErrorException(
        'MONNIFY_SOURCE_ACCOUNT_NUMBER is not configured',
      );
    }

    const result =
      await this.monnify.request<MonnifyTransferBody>(
        '/api/v2/disbursements/single',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            amount: input.amountNgn,

            /*
             * Stable SureWina payout-attempt reference.
             *
             * Reusing this exact key after an uncertain response
             * allows us to query the original transfer instead of
             * accidentally creating another payout.
             */
            reference: input.idempotencyKey,

            narration: input.reason,

            destinationBankCode:
              input.bankCode,

            destinationAccountNumber:
              input.accountNumber,

            destinationAccountName:
              input.accountName,

            currency: 'NGN',

            sourceAccountNumber,

            /*
             * SureWina never treats transfer initiation as proof
             * that the winner has received money.
             */
            async: true,
          }),
        },
      );

    const payload =
      result.payload;

    const body =
      payload?.responseBody;

    /*
     * Successful API response.
     *
     * This does NOT necessarily mean the beneficiary has been paid.
     * The returned Monnify transfer status determines our internal
     * PrizePayoutStatus.
     */
    if (
      payload?.requestSuccessful &&
      body?.reference
    ) {
      return this.fromTransferBody(
        body,
        payload.responseMessage,
      );
    }

    const responseCode =
      payload?.responseCode;

    /*
     * D05: reference already exists.
     *
     * Since the reference is intentionally stable, an earlier
     * request may already have been accepted by Monnify.
     *
     * Never initiate another transfer. Query the original.
     */
    if (responseCode === 'D05') {
      return this.getStatus(
        input.idempotencyKey,
      );
    }

    /*
     * Monnify code 99 represents an uncertain outcome.
     *
     * First try to recover by querying the same reference.
     */
    if (responseCode === '99') {
      try {
        return await this.getStatus(
          input.idempotencyKey,
        );
      } catch {
        return {
          provider:
            this.providerCode,

          reference:
            input.idempotencyKey,

          providerTransactionId:
            null,

          status:
            PrizePayoutStatus.UNKNOWN,

          rawStatus:
            responseCode,

          failureReason:
            payload?.responseMessage ??
            'Monnify returned an uncertain payout status',

          amountNgn:
            null,

          currency:
            null,

          destinationBankCode:
            null,

          destinationAccountLast4:
            null,
        };
      }
    }

    /*
     * These response codes are treated as conclusive rejection
     * before a successful transfer exists.
     */
    if (
      responseCode &&
      [
        'D01',
        'D02',
        'D03',
        'D04',
        'D06',
        'D07',
      ].includes(responseCode)
    ) {
      return {
        provider:
          this.providerCode,

        reference:
          input.idempotencyKey,

        providerTransactionId:
          null,

        status:
          PrizePayoutStatus.FAILED,

        rawStatus:
          responseCode,

        failureReason:
          payload?.responseMessage ??
          'Monnify rejected the payout',

        amountNgn:
          null,

        currency:
          null,

        destinationBankCode:
          null,

        destinationAccountLast4:
          null,
      };
    }

    /*
     * An unexpected HTTP/API response does not prove the transfer
     * failed.
     *
     * The safe state is UNKNOWN.
     */
    return {
      provider:
        this.providerCode,

      reference:
        input.idempotencyKey,

      providerTransactionId:
        null,

      status:
        PrizePayoutStatus.UNKNOWN,

      rawStatus:
        responseCode ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Unable to determine Monnify payout state',

      amountNgn:
        null,

      currency:
        null,

      destinationBankCode:
        null,

      destinationAccountLast4:
        null,
    };
  }

  async getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult> {
    const cleanReference =
      reference.trim();

    if (!cleanReference) {
      throw new InternalServerErrorException(
        'Monnify payout reference is required',
      );
    }

    const result =
      await this.monnify.request<MonnifyTransferBody>(
        `/api/v2/disbursements/single/summary?reference=${encodeURIComponent(
          cleanReference,
        )}`,
        {
          method: 'GET',
        },
      );

    const payload =
      result.payload;

    const body =
      payload?.responseBody;

    if (
      payload?.requestSuccessful &&
      body?.reference
    ) {
      return this.fromTransferBody(
        body,
        payload.responseMessage,
      );
    }

    /*
     * Monnify reports D02 when no transfer exists for the
     * supplied reference.
     *
     * This is treated as a conclusive non-existent/failed transfer.
     */
    if (
      payload?.responseCode ===
      'D02'
    ) {
      return {
        provider:
          this.providerCode,

        reference:
          cleanReference,

        providerTransactionId:
          null,

        status:
          PrizePayoutStatus.FAILED,

        rawStatus:
          'D02',

        failureReason:
          payload.responseMessage ??
          'Transfer does not exist',

        amountNgn:
          null,

        currency:
          null,

        destinationBankCode:
          null,

        destinationAccountLast4:
          null,
      };
    }

    return {
      provider:
        this.providerCode,

      reference:
        cleanReference,

      providerTransactionId:
        null,

      status:
        PrizePayoutStatus.UNKNOWN,

      rawStatus:
        payload?.responseCode ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Could not determine transfer status',

      amountNgn:
        null,

      currency:
        null,

      destinationBankCode:
        null,

      destinationAccountLast4:
        null,
    };
  }

  private fromTransferBody(
    body: MonnifyTransferBody,
    providerMessage?: string,
  ): PrizePayoutProviderResult {
    const reference =
      body.reference?.trim();

    if (!reference) {
      throw new InternalServerErrorException(
        'Monnify transfer response is missing reference',
      );
    }

    const status =
      this.mapStatus(
        body.status,
      );

    return {
      provider:
        this.providerCode,

      reference,

      providerTransactionId:
        body.transactionReference ??
        null,

      status,

      rawStatus:
        body.status ??
        'UNKNOWN',

      failureReason:
        this.isFailureStatus(
          body.status,
        )
          ? body.transactionDescription ??
            providerMessage ??
            'Monnify reported payout failure'
          : undefined,

      amountNgn:
        typeof body.amount ===
          'number' &&
        Number.isFinite(
          body.amount,
        )
          ? body.amount
          : null,

      currency:
        typeof body.currency ===
        'string'
          ? body.currency
              .trim()
              .toUpperCase()
          : null,

      destinationBankCode:
        body.destinationBankCode
          ?.trim() ??
        null,

      destinationAccountLast4:
        body.destinationAccountNumber
          ? body.destinationAccountNumber.slice(
              -4,
            )
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
      case 'PENDING':
      case 'PENDING_AUTHORIZATION':
      case 'OTP_EMAIL_DISPATCH_FAILED':
        return PrizePayoutStatus.SUBMITTED;

      case 'AWAITING_PROCESSING':
      case 'IN_PROGRESS':
        return PrizePayoutStatus.PROCESSING;

      case 'SUCCESS':
      case 'COMPLETED':
        return PrizePayoutStatus.SUCCEEDED;

      case 'REVERSED':
        return PrizePayoutStatus.REVERSED;

      case 'FAILED':
      case 'EXPIRED':
        return PrizePayoutStatus.FAILED;

      default:
        return PrizePayoutStatus.UNKNOWN;
    }
  }

  private isFailureStatus(
    rawStatus?: string,
  ): boolean {
    const status =
      rawStatus
        ?.trim()
        .toUpperCase();

    return (
      status === 'FAILED' ||
      status === 'EXPIRED' ||
      status === 'REVERSED'
    );
  }
}