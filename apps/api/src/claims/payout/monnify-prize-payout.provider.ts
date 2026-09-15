import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  PrizePayoutStatus,
} from '@prisma/client';

import {
  MonnifyClientService,
} from '../../integrations/monnify/monnify-client.service';

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

  destinationAccountNumber?: string;
  destinationAccountName?: string;
  destinationBankCode?: string;
  destinationBankName?: string;
};

@Injectable()
export class MonnifyPrizePayoutProvider
  implements PrizePayoutProvider
{
  readonly providerCode = 'MONNIFY';

  constructor(
    private readonly monnify:
      MonnifyClientService,

    private readonly config:
      ConfigService,
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
             * This is the stable SureWina idempotency key.
             *
             * Monnify requires unique references.
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
             * We intentionally request asynchronous processing.
             *
             * SureWina's payout state machine is designed to wait
             * for provider confirmation rather than blocking an
             * HTTP request until the bank responds.
             */
            async: true,
          }),
        },
      );

    const payload = result.payload;
    const body = payload?.responseBody;

    /*
     * Normal successful API response.
     *
     * "Successful API response" here does not necessarily mean
     * beneficiary paid. The Monnify status determines that.
     */
    if (
      payload?.requestSuccessful &&
      body?.reference
    ) {
      return {
        provider: this.providerCode,

        reference: body.reference,

        status: this.mapStatus(
          body.status,
        ),

        rawStatus:
          body.status ?? 'UNKNOWN',

        failureReason:
          this.isFailureStatus(body.status)
            ? body.transactionDescription ??
              payload.responseMessage
            : undefined,
      };
    }

    const responseCode =
      payload?.responseCode;

    /*
     * D05 means the supplied reference has already been used.
     *
     * Because our reference is intentionally stable, this may mean
     * Monnify already accepted an earlier request before SureWina
     * lost the response.
     *
     * Never initiate another payout. Query the existing reference.
     */
    if (responseCode === 'D05') {
      return this.getStatus(
        input.idempotencyKey,
      );
    }

    /*
     * Monnify recommends re-querying after error code 99 because
     * the actual outcome may be uncertain.
     */
    if (responseCode === '99') {
      try {
        return await this.getStatus(
          input.idempotencyKey,
        );
      } catch {
        return {
          provider: this.providerCode,

          reference:
            input.idempotencyKey,

          status:
            PrizePayoutStatus.UNKNOWN,

          rawStatus: responseCode,

          failureReason:
            payload?.responseMessage ??
            'Monnify returned an uncertain payout status',
        };
      }
    }

    /*
     * These codes represent requests Monnify has conclusively
     * rejected rather than transfers whose outcome is unknown.
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
        provider: this.providerCode,

        reference:
          input.idempotencyKey,

        status:
          PrizePayoutStatus.FAILED,

        rawStatus: responseCode,

        failureReason:
          payload?.responseMessage ??
          'Monnify rejected the payout',
      };
    }

    /*
     * Unknown HTTP/API response.
     *
     * Do NOT call this FAILED because we cannot prove that
     * Monnify did not create the transfer.
     */
    return {
      provider: this.providerCode,

      reference:
        input.idempotencyKey,

      status:
        PrizePayoutStatus.UNKNOWN,

      rawStatus:
        responseCode ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Unable to determine Monnify payout state',
    };
  }

  async getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult> {
    const result =
      await this.monnify.request<MonnifyTransferBody>(
        `/api/v2/disbursements/single/summary?reference=${encodeURIComponent(
          reference,
        )}`,
        {
          method: 'GET',
        },
      );

    const payload = result.payload;
    const body = payload?.responseBody;

    if (
      payload?.requestSuccessful &&
      body?.reference
    ) {
      return {
        provider: this.providerCode,

        reference:
          body.reference,

        status:
          this.mapStatus(body.status),

        rawStatus:
          body.status ?? 'UNKNOWN',

        failureReason:
          this.isFailureStatus(body.status)
            ? body.transactionDescription ??
              payload.responseMessage
            : undefined,
      };
    }

    /*
     * D02 means Monnify has no transaction for this reference.
     *
     * Their documentation treats that as a failed/non-existent
     * transfer.
     */
    if (
      payload?.responseCode === 'D02'
    ) {
      return {
        provider: this.providerCode,

        reference,

        status:
          PrizePayoutStatus.FAILED,

        rawStatus: 'D02',

        failureReason:
          payload.responseMessage ??
          'Transfer does not exist',
      };
    }

    return {
      provider: this.providerCode,

      reference,

      status:
        PrizePayoutStatus.UNKNOWN,

      rawStatus:
        payload?.responseCode ??
        `HTTP_${result.httpStatus}`,

      failureReason:
        payload?.responseMessage ??
        'Could not determine transfer status',
    };
  }

  private mapStatus(
    rawStatus?: string,
  ): PrizePayoutStatus {
    switch (
      rawStatus?.trim().toUpperCase()
    ) {
      /*
       * Accepted but not yet moving through the banking rail.
       */
      case 'PENDING':
      case 'PENDING_AUTHORIZATION':
      case 'OTP_EMAIL_DISPATCH_FAILED':
        return PrizePayoutStatus.SUBMITTED;

      /*
       * Actively queued/processing.
       */
      case 'AWAITING_PROCESSING':
      case 'IN_PROGRESS':
        return PrizePayoutStatus.PROCESSING;

      /*
       * Definitive success.
       */
      case 'SUCCESS':
      case 'COMPLETED':
        return PrizePayoutStatus.SUCCEEDED;

      /*
       * Definitive reversal.
       */
      case 'REVERSED':
        return PrizePayoutStatus.REVERSED;

      /*
       * Definitive failure.
       */
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
      rawStatus?.trim().toUpperCase();

    return (
      status === 'FAILED' ||
      status === 'EXPIRED' ||
      status === 'REVERSED'
    );
  }
}