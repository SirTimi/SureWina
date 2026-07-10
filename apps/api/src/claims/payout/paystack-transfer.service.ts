import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export type PayoutResult = { reference: string; devMode: boolean };

@Injectable()
export class PaystackTransferService {
  private readonly logger = new Logger(PaystackTransferService.name);

  constructor(private readonly config: ConfigService) {}

  // Dev mode: simulate. Paystack mode: create recipient + initiate transfer
  // (test keys; requires transfer OTP disabled in the Paystack dashboard).
  async payout(params: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
    amountNgn: number;
    reason: string;
  }): Promise<PayoutResult> {
    if ((this.config.get<string>('PAYOUTS_MODE') ?? 'dev') === 'dev') {
      const reference = `DEV-PAYOUT-${randomUUID()}`;
      this.logger.log(
        `[DEV PAYOUT] NGN ${params.amountNgn.toLocaleString('en-NG')} → ` +
          `${params.accountName} (${params.bankCode}/…${params.accountNumber.slice(-4)}) ref=${reference}`,
      );
      return { reference, devMode: true };
    }

    const secretKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const baseUrl = this.config.getOrThrow<string>('PAYSTACK_BASE_URL');
    const headers = {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    };

    const rcp = (await (
      await fetch(`${baseUrl}/transferrecipient`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'nuban',
          name: params.accountName,
          account_number: params.accountNumber,
          bank_code: params.bankCode,
          currency: 'NGN',
        }),
      })
    ).json()) as { status?: boolean; data?: { recipient_code?: string } };

    if (!rcp.status || !rcp.data?.recipient_code) {
      throw new ServiceUnavailableException('Could not create transfer recipient');
    }

    const trf = (await (
      await fetch(`${baseUrl}/transfer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'balance',
          amount: params.amountNgn * 100, // kobo
          recipient: rcp.data.recipient_code,
          reason: params.reason,
        }),
      })
    ).json()) as { status?: boolean; data?: { reference?: string } };

    if (!trf.status || !trf.data?.reference) {
      throw new ServiceUnavailableException('Transfer initiation failed');
    }
    return { reference: trf.data.reference, devMode: false };
  }
}