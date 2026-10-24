
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

export type WitmangoSavingsAccount = {
  id: number;
  accountNo: string;
  status: {
    id?: number;
    code?: string;
    value?: string;
  };
  currency: { code: string };
  summary: {
    accountBalance: number;
    availableBalance: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
};

export type CreateWitmangoCustomerWalletInput = {
  officeId: number;
  legalFormId: number;
  savingsProductId: number;
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
};

export type WitmangoCreatedWallet = {
  clientId: number;
  savingsAccountId: number;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

@Injectable()
export class WitmangoClientService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>(
      'WITMANGO_ENABLED',
    ) === true;
  }

  private requireId(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException(
        'A positive numeric Fineract ID is required',
      );
    }

    return value;
  }

  private fineractDate(isoDate: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      throw new BadRequestException(
        'Date must use YYYY-MM-DD',
      );
    }

    const date = new Date(`${isoDate}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== isoDate
    ) {
      throw new BadRequestException('Invalid date');
    }

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  async listGlAccounts(): Promise<unknown> {
    return this.request('GET', '/v1/glaccounts');
  }

  async listSavingsProducts(): Promise<unknown> {
    return this.request('GET', '/v1/savingsproducts');
  }

  async getSavingsAccount(
    accountId: number,
  ): Promise<WitmangoSavingsAccount> {
    const id = this.requireId(accountId);

    const result = await this.request(
      'GET',
      `/v1/savingsaccounts/${id}`,
    );

    if (
      !isRecord(result) ||
      result.id !== id ||
      typeof result.accountNo !== 'string' ||
      !isRecord(result.status) ||
      !isRecord(result.currency) ||
      result.currency.code !== 'NGN' ||
      !isRecord(result.summary) ||
      typeof result.summary.accountBalance !== 'number' ||
      !Number.isFinite(result.summary.accountBalance) ||
      typeof result.summary.availableBalance !== 'number' ||
      !Number.isFinite(result.summary.availableBalance)
    ) {
      throw new BadGatewayException(
        'Witmango returned an invalid NGN savings account',
      );
    }

    return result as unknown as WitmangoSavingsAccount;
  }

  async getSavingsAccountWithTransactions(
    accountId: number,
  ): Promise<unknown> {
    const id = this.requireId(accountId);

    return this.request(
      'GET',
      `/v1/savingsaccounts/${id}?associations=transactions`,
    );
  }

  async createClientWithWallet(
    input: CreateWitmangoCustomerWalletInput,
  ): Promise<WitmangoCreatedWallet> {
    if (
      !this.config.get<boolean>(
        'WITMANGO_PROVISIONING_ENABLED',
      )
    ) {
      throw new ServiceUnavailableException(
        'Witmango wallet provisioning is disabled',
      );
    }

    this.requireId(input.officeId);
    this.requireId(input.legalFormId);
    this.requireId(input.savingsProductId);

    if (
      !/^[a-zA-Z0-9_-]{8,100}$/.test(input.externalId) ||
      !input.firstName.trim() ||
      !input.lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    ) {
      throw new BadRequestException(
        'Valid customer onboarding information is required',
      );
    }

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const result = await this.request(
      'POST',
      '/v1/clients',
      {
        officeId: input.officeId,
        legalFormId: input.legalFormId,
        active: true,

        externalId: input.externalId,

        firstname: input.firstName.trim(),
        lastname: input.lastName.trim(),

        emailAddress: input.email
          .trim()
          .toLowerCase(),

        dateOfBirth: this.fineractDate(
          input.dateOfBirth,
        ),

        submittedOnDate: this.fineractDate(today),
        activationDate: this.fineractDate(today),

        savingsProductId: input.savingsProductId,

        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      },
    );

    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.clientId) ||
      Number(result.clientId) <= 0 ||
      !Number.isSafeInteger(result.savingsId) ||
      Number(result.savingsId) <= 0 ||
      result.resourceExternalId !== input.externalId
    ) {
      throw new BadGatewayException(
        'Witmango wallet creation returned incomplete identifiers',
      );
    }

    return {
      clientId: Number(result.clientId),
      savingsAccountId: Number(result.savingsId),
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Witmango integration is disabled',
      );
    }

    const base = this.config
      .get<string>('WITMANGO_BASE_URL')
      ?.trim();

    const tenant = this.config
      .get<string>('WITMANGO_TENANT_ID')
      ?.trim();

    const username = this.config
      .get<string>('WITMANGO_USERNAME');

    const password = this.config
      .get<string>('WITMANGO_PASSWORD');

    if (!base || !tenant || !username || !password) {
      throw new ServiceUnavailableException(
        'Witmango integration is not configured',
      );
    }

    let parsed: URL;

    try {
      parsed = new URL(base);
    } catch {
      throw new ServiceUnavailableException(
        'Witmango base URL is invalid',
      );
    }

    const isLocal = [
      'localhost',
      '127.0.0.1',
      '[::1]',
    ].includes(parsed.hostname);

    const nonProduction =
      this.config.get<string>('NODE_ENV') !==
      'production';

    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      (
        parsed.protocol !== 'https:' &&
        !(isLocal && nonProduction)
      ) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname.replace(/\/+$/, '') !==
        '/fineract-provider/api'
    ) {
      throw new ServiceUnavailableException(
        'Witmango requires a secure Fineract API base URL',
      );
    }

    const timeout =
      this.config.get<number>(
        'WITMANGO_TIMEOUT_MS',
      ) ?? 10000;

    const authorization = Buffer.from(
      `${username}:${password}`,
      'utf8',
    ).toString('base64');

    let response: Response;

    try {
      response = await fetch(
        `${base.replace(/\/+$/, '')}${path}`,
        {
          method,
          headers: {
            Authorization: `Basic ${authorization}`,
            'Fineract-Platform-TenantId': tenant,
            Accept: 'application/json',
            'Cache-Control': 'no-store',
            ...(body
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          ...(body
            ? { body: JSON.stringify(body) }
            : {}),
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        },
      );
    } catch {
      // An uncertain POST might have succeeded upstream.
      // The provisioning coordinator must not retry it.
      throw new ServiceUnavailableException(
        'Witmango API request outcome is uncertain',
      );
    }

    if (!response.ok) {
      // Do not expose upstream error bodies or credentials.
      throw new BadGatewayException(
        `Witmango request failed with HTTP ${response.status}`,
      );
    }

    try {
      return await response.json() as unknown;
    } catch {
      throw new BadGatewayException(
        'Witmango returned invalid JSON',
      );
    }
  }
}
