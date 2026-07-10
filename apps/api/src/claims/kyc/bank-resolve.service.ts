import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ResolvedBankAccount = {
  accountNumber: string;
  accountName: string;
  bankCode: string;
};

// NUBAN resolution via Paystack /bank/resolve — a live lookup that works
// with test keys. The resolved name is shown back to the winner so typos
// are caught before any payout is attempted.
@Injectable()
export class BankResolveService {
  private readonly logger = new Logger(BankResolveService.name);

  constructor(private readonly config: ConfigService) {}

  async resolve(accountNumber: string, bankCode: string): Promise<ResolvedBankAccount> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      throw new InternalServerErrorException('Paystack is not configured');
    }
    const baseUrl = this.config.getOrThrow<string>('PAYSTACK_BASE_URL');

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/bank/resolve?account_number=${encodeURIComponent(
          accountNumber,
        )}&bank_code=${encodeURIComponent(bankCode)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
    } catch {
      throw new ServiceUnavailableException('Bank resolution service unreachable');
    }

    const payload = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { account_name?: string; account_number?: string };
    } | null;

    if (!response.ok || !payload?.status || !payload.data?.account_name) {
      this.logger.warn(
        `Bank resolve failed (${response.status}): ${payload?.message ?? 'no body'}`,
      );
      throw new BadRequestException(
        'Could not resolve this account. Check the account number and bank code.',
      );
    }

    return {
      accountNumber,
      accountName: payload.data.account_name,
      bankCode,
    };
  }
}