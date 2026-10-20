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
  status: { id?: number; code?: string; value?: string };
  currency: { code: string };
  summary: {
    accountBalance: number;
    availableBalance: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
  };
};

/**
 * Read-only foundation for the CBA's documented Fineract API.
 *
 * The account balance is external evidence, NOT SureWina's ledger-backed
 * available/held balance. No money movement or account creation is exposed
 * until transaction identity, idempotency and reconciliation are agreed.
 */
@Injectable()
export class WitmangoClientService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('WITMANGO_ENABLED') === true;
  }

  async listGlAccounts(): Promise<unknown> {
    return this.get('/v1/glaccounts');
  }

  async listSavingsProducts(): Promise<unknown> {
    return this.get('/v1/savingsproducts');
  }

  async getSavingsAccount(accountId: number): Promise<WitmangoSavingsAccount> {
    const id = this.requireId(accountId);
    const result = await this.get(`/v1/savingsaccounts/${id}`);

    if (!isRecord(result) ||
        !Number.isSafeInteger(result.id) ||
        result.id !== id ||
        typeof result.accountNo !== 'string' ||
        !isRecord(result.status) ||
        !isRecord(result.currency) ||
        result.currency.code !== 'NGN' ||
        !isRecord(result.summary) ||
        typeof result.summary.accountBalance !== 'number' ||
        !Number.isFinite(result.summary.accountBalance) ||
        typeof result.summary.availableBalance !== 'number' ||
        !Number.isFinite(result.summary.availableBalance)) {
      throw new BadGatewayException('Witmango returned an invalid NGN savings account');
    }

    return result as unknown as WitmangoSavingsAccount;
  }

  async getSavingsAccountWithTransactions(accountId: number): Promise<unknown> {
    const id = this.requireId(accountId);
    return this.get(`/v1/savingsaccounts/${id}?associations=transactions`);
  }

  private requireId(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException('A positive numeric savings account ID is required');
    }
    return value;
  }

  private async get(path: string): Promise<unknown> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Witmango integration is disabled');
    }

    const base = this.config.get<string>('WITMANGO_BASE_URL')?.trim();
    const tenant = this.config.get<string>('WITMANGO_TENANT_ID')?.trim();
    const username = this.config.get<string>('WITMANGO_USERNAME');
    const password = this.config.get<string>('WITMANGO_PASSWORD');
    if (!base || !tenant || !username || !password) {
      throw new ServiceUnavailableException('Witmango integration is not configured');
    }

    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      throw new ServiceUnavailableException('Witmango base URL is invalid');
    }

    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    const nonProd = this.config.get<string>('NODE_ENV') !== 'production';
    if (!['https:', 'http:'].includes(parsed.protocol) ||
        (parsed.protocol !== 'https:' && !(isLocal && nonProd)) ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname.replace(/\/+$/, '') !== '/fineract-provider/api') {
      throw new ServiceUnavailableException('Witmango requires a secure Fineract API base URL');
    }

    const timeout = this.config.get<number>('WITMANGO_TIMEOUT_MS') ?? 10000;
    const authorization = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authorization}`,
          'Fineract-Platform-TenantId': tenant,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      // Never forward upstream response bodies, Basic Auth, or tenant secrets.
      throw new ServiceUnavailableException('Witmango API is unreachable');
    }

    if (!response.ok) {
      throw new BadGatewayException(`Witmango request failed with HTTP ${response.status}`);
    }

    try {
      return await response.json() as unknown;
    } catch {
      throw new BadGatewayException('Witmango returned an invalid JSON response');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
