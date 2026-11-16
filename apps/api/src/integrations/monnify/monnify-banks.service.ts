import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MonnifyClientService } from './monnify-client.service';

const BANKS_PATH = '/api/v1/banks';
const CACHE_MS = 6 * 60 * 60 * 1000;

// Bank codes are digits. Anything else in Monnify's list is left out rather
// than offered and then refused.
const BANK_CODE = /^\d{3,10}$/;

export type MonnifyBank = { code: string; name: string };

type RawBank = { code?: unknown; name?: unknown };

// The banks Monnify can pay out to, with Monnify's own codes.
//
// Withdrawals are paid by Monnify, so the account a customer or agent saves
// must use a code Monnify recognises. Paystack's list uses different codes
// for most microfinance banks and fintechs, and a withdrawal to one of those
// would fail at payout.
@Injectable()
export class MonnifyBanksService {
  private readonly logger = new Logger(MonnifyBanksService.name);
  private cached: { banks: MonnifyBank[]; expiresAt: number } | null = null;

  constructor(private readonly client: MonnifyClientService) {}

  async listBanks(): Promise<{ banks: MonnifyBank[] }> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return { banks: this.cached.banks };
    }

    const result = await this.client.request<RawBank[]>(BANKS_PATH, {
      method: 'GET',
    });

    const body = result.payload?.responseBody;

    if (
      result.httpStatus < 200 ||
      result.httpStatus >= 300 ||
      result.payload?.requestSuccessful !== true ||
      !Array.isArray(body)
    ) {
      this.logger.error(
        `Monnify bank list failed: HTTP ${result.httpStatus}, code ${result.payload?.responseCode ?? 'none'}`,
      );

      // A stale list is better than none: codes rarely change.
      if (this.cached) {
        return { banks: this.cached.banks };
      }

      throw new ServiceUnavailableException(
        'Bank list is temporarily unavailable',
      );
    }

    const byCode = new Map<string, MonnifyBank>();

    for (const entry of body) {
      const code = typeof entry?.code === 'string' ? entry.code.trim() : '';
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';

      if (BANK_CODE.test(code) && name && !byCode.has(code)) {
        byCode.set(code, { code, name });
      }
    }

    const banks = [...byCode.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    if (banks.length === 0) {
      throw new ServiceUnavailableException(
        'Bank list is temporarily unavailable',
      );
    }

    this.cached = { banks, expiresAt: Date.now() + CACHE_MS };

    return { banks };
  }

  // The bank for a code, or null if Monnify does not pay out to it.
  async findBank(code: string): Promise<MonnifyBank | null> {
    const { banks } = await this.listBanks();

    return banks.find((bank) => bank.code === code) ?? null;
  }
}
