
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrizePayoutStatus } from '@prisma/client';

import {
  InitiatePrizePayoutInput,
  PrizePayoutProvider,
  PrizePayoutProviderResult,
} from './prize-payout.provider';
import { createHmac } from 'node:crypto'

type PaystackRecipient = {
  recipient_code?: string;
  currency?: string;
  type?: string;
  details?: {
    bank_code?: string;
    account_number?: string;
  };
};

type PaystackTransfer = {
  id?: number | string;
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  transfer_code?: string;
  recipient?: PaystackRecipient | number;
};

type ApiResponse<T> = {
  status?: boolean;
  data?: T;
};

@Injectable()
export class PaystackPrizePayoutProvider
  implements PrizePayoutProvider
{
  readonly providerCode = 'PAYSTACK' as const;

  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<boolean>(
        'PAYSTACK_TRANSFERS_ENABLED',
    ) === true;
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const secret = this.config
      .get<string>('PAYSTACK_SECRET_KEY')
      ?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'Paystack is not configured',
      );
    }

    const base = (
      this.config.get<string>('PAYSTACK_BASE_URL') ||
      'https://api.paystack.co'
    ).replace(/\/+$/, '');

    // Avoid forwarding credentials or provider response
    // bodies into logs or exception messages.
    let response: Response;

    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json',
          ...(body
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Paystack request outcome is uncertain',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Paystack request was not confirmed',
      );
    }

    let payload: ApiResponse<T>;

    try {
      payload = (await response.json()) as ApiResponse<T>;
    } catch {
      throw new ServiceUnavailableException(
        'Paystack returned an invalid response',
      );
    }

    if (
      payload.status !== true ||
      payload.data === undefined
    ) {
      throw new ServiceUnavailableException(
        'Paystack response was inconclusive',
      );
    }

    return payload.data;
  }

  private unknown(
    reference: string,
    reason: string,
  ): PrizePayoutProviderResult {
    return {
      provider: 'PAYSTACK',
      reference,
      status: PrizePayoutStatus.UNKNOWN,
      rawStatus: 'UNKNOWN',
      failureReason: reason,
    };
  }

  private mapStatus(value?: string): PrizePayoutStatus {
    switch (value?.trim().toLowerCase()) {
      case 'success':
        return PrizePayoutStatus.SUCCEEDED;
      case 'failed':
        return PrizePayoutStatus.FAILED;
      case 'reversed':
        return PrizePayoutStatus.REVERSED;
      case 'pending':
        return PrizePayoutStatus.PROCESSING;
      case 'queued':
        return PrizePayoutStatus.SUBMITTED;
      default:
        // OTP, approval, blocked, abandoned, unexpected,
        // or missing statuses must not authorize payment.
        return PrizePayoutStatus.UNKNOWN;
    }
  }

  private async checkBalance(amountKobo: number) {
    const balances = await this.request<
      Array<{ currency?: string; balance?: number }>
    >('/balance', 'GET');

    if (!Array.isArray(balances)) {
      throw new ServiceUnavailableException(
        'Paystack balance could not be verified',
      );
    }

    const ngnBalances = balances.filter(
      (balance) => balance.currency === 'NGN',
    );

    if (
      ngnBalances.length !== 1 ||
      !Number.isSafeInteger(ngnBalances[0].balance)
    ) {
      throw new ServiceUnavailableException(
        'An unambiguous NGN transfer balance is required',
      );
    }

    // This is a configurable minimum safety reserve.
    // Paystack applies its actual transfer fees separately.
    const reserve = this.config.get<number>(
      'PAYSTACK_TRANSFER_FEE_BUFFER_KOBO',
    ) ?? 100000;

    if (
      !Number.isSafeInteger(reserve) ||
      reserve < 0 ||
      ngnBalances[0].balance! < amountKobo + reserve
    ) {
      throw new ServiceUnavailableException(
        'Insufficient Paystack transfer balance or safety reserve',
      );
    }
  }

  async initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Paystack bank transfers are disabled',
      );
    }

    if (
      !/^[a-z0-9_-]{16,50}$/.test(input.idempotencyKey) ||
      !/^\d{10}$/.test(input.accountNumber) ||
      !/^\d{3,6}$/.test(input.bankCode) ||
      !input.accountName.trim() ||
      !Number.isSafeInteger(input.amountNgn) ||
      input.amountNgn <= 0
    ) {
      throw new ServiceUnavailableException(
        'Invalid approved transfer details',
      );
    }

    const amountKobo = input.amountNgn * 100;

    if (!Number.isSafeInteger(amountKobo)) {
      throw new ServiceUnavailableException(
        'Transfer amount is invalid',
      );
    }

    // Balance check is a guard, not a guarantee:
    // concurrent transfers and Paystack fees still apply.
    await this.checkBalance(amountKobo);

    // Register the verified Nigerian bank beneficiary.
    const recipient = await this.request<PaystackRecipient>(
      '/transferrecipient',
      'POST',
      {
        type: 'nuban',
        name: input.accountName,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: 'NGN',
      },
    );

    if (
      !recipient.recipient_code ||
      !/^RCP_[A-Za-z0-9]+$/.test(
        recipient.recipient_code,
      )
    ) {
      throw new ServiceUnavailableException(
        'Paystack transfer recipient was not confirmed',
      );
    }

    // Retrieve the recipient separately and verify the
    // actual bank destination before initiating money movement.
    const registered = await this.request<PaystackRecipient>(
      `/transferrecipient/${encodeURIComponent(
        recipient.recipient_code,
      )}`,
      'GET',
    );

    if (
      registered.recipient_code !== recipient.recipient_code ||
      registered.type !== 'nuban' ||
      registered.currency !== 'NGN' ||
      registered.details?.bank_code !== input.bankCode ||
      registered.details.account_number !== input.accountNumber
    ) {
      throw new ServiceUnavailableException(
        'Paystack recipient does not match approved bank destination',
      );
    }

    // Stable attempt reference. Never create another
    // reference when an existing transfer is uncertain.
    const transfer = await this.request<PaystackTransfer>(
      '/transfer',
      'POST',
      {
        source: 'balance',
        amount: amountKobo,
        currency: 'NGN',
        recipient: recipient.recipient_code,
        reference: input.idempotencyKey,
        reason: input.reason.slice(0, 100),
      },
    );

    if (transfer.reference !== input.idempotencyKey) {
      return this.unknown(
        input.idempotencyKey,
        'Paystack returned a different transfer reference',
      );
    }

    if (
      transfer.amount !== amountKobo ||
      transfer.currency !== 'NGN'
    ) {
      return this.unknown(
        input.idempotencyKey,
        'Paystack initiation financial details are inconsistent',
      );
    }

    // An initiation response is not settlement proof,
    // including when it reports "success".
    return {
      provider: this.providerCode,
      reference: input.idempotencyKey,
      providerTransactionId:
        transfer.id === undefined
          ? null
          : String(transfer.id),
      status: PrizePayoutStatus.PROCESSING,
      rawStatus: transfer.status ?? 'initiated',
      amountNgn: input.amountNgn,
      currency: 'NGN',
    };
  }

  async getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult> {
    if (!/^[a-z0-9_-]{16,50}$/.test(reference)) {
      throw new ServiceUnavailableException(
        'Invalid transfer reference',
      );
    }

    const transfer = await this.request<PaystackTransfer>(
      `/transfer/verify/${encodeURIComponent(reference)}`,
      'GET',
    );

    if (transfer.reference !== reference) {
      return this.unknown(
        reference,
        'Transfer verification reference mismatch',
      );
    }

    const verifiedRecipient = transfer.recipient && typeof transfer.recipient === 'object' ? transfer.recipient : null

    const status = this.mapStatus(transfer.status);

    // Financial identity is mandatory before a payout
    // is allowed to finalize as SUCCEEDED.
    if (
      status === PrizePayoutStatus.SUCCEEDED &&
      (
        !Number.isSafeInteger(transfer.amount) ||
        transfer.amount! <= 0 ||
        transfer.amount! % 100 !== 0 ||
        transfer.currency !== 'NGN' ||
        typeof transfer.recipient !== 'object' ||
        transfer.recipient?.type !== 'nuban' ||
        !/^\d{3,6}$/.test(
          transfer.recipient.details?.bank_code ?? '',
        ) ||
        !/^\d{10}$/.test(
          transfer.recipient.details?.account_number ?? '',
        ) ||
        !verifiedRecipient || verifiedRecipient.type !== 'nuban' ||
        ! /^\d{3,6}$/.test(verifiedRecipient.details?.bank_code ?? '') ||
        ! /^\d{10}$/.test(verifiedRecipient.details?.account_number ?? '')

      )
    ) {
      return this.unknown(
        reference,
        'Verified transfer is missing financial or destination evidence',
      );
    }

    const details = verifiedRecipient?.details;

    return {
      provider: this.providerCode,
      reference,
      providerTransactionId:
        transfer.id === undefined
          ? null
          : String(transfer.id),
      status,
      rawStatus: transfer.status ?? 'unknown',
      amountNgn:
        Number.isSafeInteger(transfer.amount) &&
        transfer.amount! % 100 === 0
          ? transfer.amount! / 100
          : null,
      currency: transfer.currency ?? null,
      destinationBankCode: details?.bank_code ?? null,
      destinationAccountLast4:
        details?.account_number?.slice(-4) ?? null,
      failureReason:
        status === PrizePayoutStatus.UNKNOWN
          ? 'Transfer requires verification or manual reconciliation'
          : undefined,

      destinationAccountFingerprint:
        details?.bank_code &&
        details?.account_number
            ? this.fingerprint(
                details.bank_code,
                details.account_number,
            )
            : null,
        };
  }

  
    private fingerprint(
        bankCode: string,
        accountNumber: string,
    ): string {
        const key = this.config
            .get<string>('KYC_BANK_FINGERPRINT_KEY')
            ?.trim();

        if (!key || key.length < 32) {
            throw new ServiceUnavailableException(
                'Bank ownership verification is not configured',
            );
        }

        return createHmac('sha256', key)
            .update(
                `surewina:bank:v1:${bankCode}:${accountNumber}`,
            )
            .digest('hex');
        }

}
