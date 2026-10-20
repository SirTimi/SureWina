
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ResolvedBankAccount = {
  accountNumber: string;
  accountName: string;
  bankCode: string;
};

export type NigerianBank = {
  code: string;
  name: string;
};

type PaystackBank = {
  code?: string;
  name?: string;
  active?: boolean;
  is_deleted?: boolean;
  currency?: string;
  type?: string;
};

type PaystackResponse = {
  status?: boolean;
  data?: unknown;
  meta?: { next?: string | null };
};

@Injectable()
export class BankResolveService {
  private cachedBanks:
    | { banks: NigerianBank[]; expiresAt: number }
    | null = null;

  constructor(private readonly config: ConfigService) {}

  async listBanks(): Promise<{ banks: NigerianBank[] }> {
    if (
      this.cachedBanks &&
      Date.now() < this.cachedBanks.expiresAt
    ) {
      return { banks: this.cachedBanks.banks };
    }

    const collected = new Map<string, NigerianBank>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let finished = false;

    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({
        country: 'nigeria',
        perPage: '100',
        use_cursor: 'true',
      });

      if (cursor) query.set('next', cursor);

      const result = await this.request(
        `/bank?${query.toString()}`,
        false,
      );

      if (
        result.status !== true ||
        !Array.isArray(result.data)
      ) {
        throw new ServiceUnavailableException(
          'Bank directory is temporarily unavailable',
        );
      }

      for (const entry of result.data as PaystackBank[]) {
        if (
          typeof entry.code !== 'string' ||
          !/^\d{3,6}$/.test(entry.code) ||
          typeof entry.name !== 'string' ||
          !entry.name.trim() ||
          entry.active === false ||
          entry.is_deleted === true ||
          (entry.currency && entry.currency !== 'NGN') ||
          (entry.type && entry.type !== 'nuban')
        ) {
          continue;
        }

        collected.set(entry.code, {
          code: entry.code,
          name: entry.name.trim(),
        });
      }

      const next = result.meta?.next;

      if (!next) {
        finished = true;
        break;
      }

      if (seenCursors.has(next)) {
        throw new ServiceUnavailableException(
          'Bank directory pagination failed',
        );
      }

      seenCursors.add(next);
      cursor = next;
    }

    if (!finished || collected.size === 0) {
      throw new ServiceUnavailableException(
        'Bank directory is temporarily unavailable',
      );
    }

    const banks = [...collected.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    this.cachedBanks = {
      banks,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };

    return { banks };
  }

  async resolve(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolvedBankAccount> {
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new BadRequestException(
        'Account number must be exactly 10 digits',
      );
    }

    if (!/^\d{3,6}$/.test(bankCode)) {
      throw new BadRequestException('Invalid bank code');
    }

    const { banks } = await this.listBanks();

    if (!banks.some((bank) => bank.code === bankCode)) {
      throw new BadRequestException(
        'Please select a supported Nigerian bank',
      );
    }

    const query = new URLSearchParams({
      account_number: accountNumber,
      bank_code: bankCode,
    });

    const result = await this.request(
      `/bank/resolve?${query.toString()}`,
      true,
    );

    const data =
      result.data &&
      typeof result.data === 'object' &&
      !Array.isArray(result.data)
        ? (result.data as Record<string, unknown>)
        : null;

    if (
      result.status !== true ||
      !data ||
      data.account_number !== accountNumber ||
      typeof data.account_name !== 'string' ||
      !data.account_name.trim()
    ) {
      throw new BadRequestException(
        'Could not resolve this bank account',
      );
    }

    return {
      accountNumber,
      bankCode,
      accountName: data.account_name.trim(),
    };
  }

  private async request(
    path: string,
    accountLookup: boolean,
  ): Promise<PaystackResponse> {
    const secret = this.config
      .get<string>('PAYSTACK_SECRET_KEY')
      ?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'Bank verification is not configured',
      );
    }

    const base = (
      this.config.get<string>('PAYSTACK_BASE_URL') ||
      'https://api.paystack.co'
    ).replace(/\/+$/, '');

    let response: Response;

    try {
      response = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Bank verification is temporarily unavailable',
      );
    }

    if (
      accountLookup &&
      [400, 404, 422].includes(response.status)
    ) {
      throw new BadRequestException(
        'Could not resolve this bank account',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Bank verification provider is unavailable',
      );
    }

    try {
      return (await response.json()) as PaystackResponse;
    } catch {
      throw new ServiceUnavailableException(
        'Invalid response from bank verification provider',
      );
    }
  }
}
