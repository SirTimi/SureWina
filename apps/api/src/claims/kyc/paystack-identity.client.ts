import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PaystackResponse = {
  status?: boolean;
  message?: string;
  data?: { customer_code?: string };
};

export type PaystackIdentityInput = {
  customerCode: string;
  bvn: string;
  accountNumber: string;
  bankCode: string;
  firstName: string;
  lastName: string;
};

export type CreatePaystackCustomerInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
};

@Injectable()
export class PaystackIdentityClient {
  constructor(private readonly config: ConfigService) {}

  private async post(path: string, body: Record<string, unknown>): Promise<PaystackResponse> {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('Paystack identity verification is not configured');
    }
    const base = (this.config.get<string>('PAYSTACK_BASE_URL') ||
      'https://api.paystack.co').replace(/\/+$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // The upstream request may have succeeded before a timeout. Caller
      // must mark the attempt UNKNOWN, never retry automatically.
      throw new ServiceUnavailableException('Paystack identity outcome is uncertain');
    }
    if (!response.ok) {
      // A 403 often means this Paystack merchant lacks feature access.
      // Never expose provider response bodies, BVN, or the secret key.
      throw new ServiceUnavailableException('Paystack could not accept identity verification');
    }
    try {
      const payload = (await response.json()) as PaystackResponse;
      if (!payload || payload.status !== true) {
        throw new Error('Invalid response');
      }
      return payload;
    } catch {
      throw new ServiceUnavailableException('Paystack identity response is inconclusive');
    }
  }

  async createCustomer(input: CreatePaystackCustomerInput): Promise<string> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
        !input.firstName.trim() || !input.lastName.trim()) {
      throw new BadRequestException('Valid customer legal name and email are required');
    }
    const response = await this.post('/customer', {
      email: input.email.trim().toLowerCase(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone,
    });
    const code = response.data?.customer_code;
    if (!code || !/^CUS_[A-Za-z0-9]+$/.test(code)) {
      throw new ServiceUnavailableException('Paystack returned no valid customer reference');
    }
    return code;
  }

  async submit(input: PaystackIdentityInput): Promise<{ status: 'SUBMITTED' }> {
    if (!/^CUS_[A-Za-z0-9]+$/.test(input.customerCode)) {
      throw new BadRequestException('Invalid Paystack customer reference');
    }
    if (!/^\d{11}$/.test(input.bvn) || !/^\d{10}$/.test(input.accountNumber) ||
        !/^\d{3,6}$/.test(input.bankCode)) {
      throw new BadRequestException('Invalid BVN or bank account information');
    }
    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new BadRequestException('Legal names are required');
    }
    await this.post(`/customer/${encodeURIComponent(input.customerCode)}/identification`, {
      country: 'NG',
      type: 'bank_account',
      account_number: input.accountNumber,
      bvn: input.bvn,
      bank_code: input.bankCode,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
    });
    // Only acceptance: actual success must arrive via the authenticated webhook.
    return { status: 'SUBMITTED' };
  }
}
