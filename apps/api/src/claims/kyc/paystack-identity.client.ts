
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackIdentityInput = {
  customerCode: string;
  bvn: string;
  accountNumber: string;
  bankCode: string;
  firstName: string;
  lastName: string;
};

@Injectable()
export class PaystackIdentityClient {
  constructor(private readonly config: ConfigService) {}

  async submit(input: PaystackIdentityInput): Promise<{
    status: 'SUBMITTED';
  }> {
    if (!/^CUS_[A-Za-z0-9]+$/.test(input.customerCode)) {
      throw new BadRequestException(
        'Invalid Paystack customer reference',
      );
    }

    if (!/^\d{11}$/.test(input.bvn)) {
      throw new BadRequestException(
        'BVN must be exactly 11 digits',
      );
    }

    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw new BadRequestException(
        'Account number must be exactly 10 digits',
      );
    }

    if (!/^\d{3,6}$/.test(input.bankCode)) {
      throw new BadRequestException('Invalid bank code');
    }

    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new BadRequestException(
        'Legal first and last names are required',
      );
    }

    const secret = this.config
      .get<string>('PAYSTACK_SECRET_KEY')
      ?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'Identity verification is not configured',
      );
    }

    const base = (
      this.config.get<string>('PAYSTACK_BASE_URL') ||
      'https://api.paystack.co'
    ).replace(/\/+$/, '');

    let response: Response;

    try {
      response = await fetch(
        `${base}/customer/${encodeURIComponent(
          input.customerCode,
        )}/identification`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            country: 'NG',
            type: 'bank_account',
            account_number: input.accountNumber,
            bvn: input.bvn,
            bank_code: input.bankCode,
            first_name: input.firstName.trim(),
            last_name: input.lastName.trim(),
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Identity verification outcome is unknown',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Paystack could not accept identity verification',
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Identity verification outcome is unknown',
      );
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('status' in payload) ||
      payload.status !== true
    ) {
      throw new ServiceUnavailableException(
        'Paystack did not confirm request acceptance',
      );
    }

    // This is NOT evidence of successful BVN verification.
    return { status: 'SUBMITTED' };
  }
}
