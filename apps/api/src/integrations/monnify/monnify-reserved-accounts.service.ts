import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MonnifyClientService } from './monnify-client.service';

const RESERVE_PATH = '/api/v2/bank-transfer/reserved-accounts';
const RESERVE_WITH_LIMIT_PATH = '/api/v2/bank-transfer/reserved-accounts/limit';

export type MonnifyReservedBankAccount = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
};

export type ReserveAccountInput = {
  // SureWina's own reference for the reservation. Monnify refuses to reserve
  // twice against the same one, which is what makes a retry safe.
  accountReference: string;
  // Shown to the sender when their bank looks the account number up.
  accountName: string;
  customerName: string;
  // Mandatory at Monnify, which treats it as the customer's identifier.
  customerEmail: string;
  bvn: string;
  // Attached at creation, so the account never exists without its limits.
  limitProfileCode: string;
};

export type MonnifyReservation = {
  reservationReference: string;
  accounts: MonnifyReservedBankAccount[];
};

export type ReserveAccountResult =
  | ({ outcome: 'RESERVED' } & MonnifyReservation)
  // A reservation already exists under this reference — from an earlier
  // attempt whose answer never arrived. Not an error: look it up.
  | { outcome: 'DUPLICATE_REFERENCE' };

type RawReservation = {
  accountReference?: string;
  reservationReference?: string;
  status?: string;
  accounts?: unknown;
  // The reserve-with-limit response may describe a single account inline
  // rather than as a list.
  accountNumber?: string;
  bankName?: string;
  bankCode?: string;
};

// Customer reserved accounts — the account number a customer transfers into
// to fund their wallet.
//
// Disabled by default. Paths and shapes follow Monnify's published
// reference; none of it has been exercised against a live or sandbox account
// yet, and the first real reservation should be watched.
@Injectable()
export class MonnifyReservedAccountsService {
  private readonly logger = new Logger(MonnifyReservedAccountsService.name);

  constructor(
    private readonly client: MonnifyClientService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return (
      this.config.get<boolean>('MONNIFY_RESERVED_ACCOUNTS_ENABLED') === true
    );
  }

  async reserve(input: ReserveAccountInput): Promise<ReserveAccountResult> {
    this.requireEnabled();

    const accountReference = this.requireReference(input.accountReference);

    if (!/^\d{11}$/.test(input.bvn)) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    if (
      !input.accountName.trim() ||
      !input.customerName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail) ||
      !input.limitProfileCode.trim()
    ) {
      throw new BadRequestException(
        'A name, email and limit profile are required to reserve an account',
      );
    }

    const result = await this.client.request<RawReservation>(
      RESERVE_WITH_LIMIT_PATH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountReference,
          accountName: input.accountName.trim(),
          currencyCode: 'NGN',
          contractCode: this.contractCode(),
          customerEmail: input.customerEmail.trim().toLowerCase(),
          customerName: input.customerName.trim(),
          bvn: input.bvn,
          limitProfileCode: input.limitProfileCode.trim(),
          getAllAvailableBanks: true,
        }),
      },
    );

    const payload = result.payload;

    if (
      result.httpStatus >= 200 &&
      result.httpStatus < 300 &&
      payload?.requestSuccessful === true &&
      payload.responseBody
    ) {
      return {
        outcome: 'RESERVED',
        ...this.parse(payload.responseBody, accountReference),
      };
    }

    if (/same reference/i.test(payload?.responseMessage ?? '')) {
      return { outcome: 'DUPLICATE_REFERENCE' };
    }

    // The BVN never appears in logs.
    this.logger.error(
      `Account reservation failed: HTTP ${result.httpStatus}, code ${payload?.responseCode ?? 'none'}`,
    );

    throw new BadGatewayException(
      'A funding account could not be reserved right now',
    );
  }

  // Looks a reservation up by SureWina's own reference. Returns null when
  // Monnify has none — which, after a failed attempt, means it is safe to
  // try reserving again.
  async find(accountReference: string): Promise<MonnifyReservation | null> {
    this.requireEnabled();

    const reference = this.requireReference(accountReference);

    const result = await this.client.request<RawReservation>(
      `${RESERVE_PATH}/${encodeURIComponent(reference)}`,
      { method: 'GET' },
    );

    const payload = result.payload;

    if (
      result.httpStatus >= 200 &&
      result.httpStatus < 300 &&
      payload?.requestSuccessful === true &&
      payload.responseBody
    ) {
      return this.parse(payload.responseBody, reference);
    }

    if (
      result.httpStatus === 404 ||
      /cannot find|not found|does not exist/i.test(
        payload?.responseMessage ?? '',
      )
    ) {
      return null;
    }

    throw new BadGatewayException(
      'The funding account could not be looked up right now',
    );
  }

  private parse(
    body: RawReservation,
    expectedReference: string,
  ): MonnifyReservation {
    const listed = Array.isArray(body.accounts) ? body.accounts : [];

    const candidates: unknown[] =
      listed.length > 0
        ? listed
        : [
            {
              bankCode: body.bankCode,
              bankName: body.bankName,
              accountNumber: body.accountNumber,
            },
          ];

    const accounts = candidates.filter(
      (account): account is MonnifyReservedBankAccount =>
        typeof account === 'object' &&
        account !== null &&
        typeof (account as MonnifyReservedBankAccount).bankCode === 'string' &&
        typeof (account as MonnifyReservedBankAccount).bankName === 'string' &&
        /^\d{10}$/.test(
          String((account as MonnifyReservedBankAccount).accountNumber ?? ''),
        ),
    );

    // An account number is about to be shown to a customer as the place to
    // send money. Anything less than a complete, active, correctly-referenced
    // reservation is refused outright.
    if (
      body.accountReference !== expectedReference ||
      typeof body.reservationReference !== 'string' ||
      !body.reservationReference ||
      body.status !== 'ACTIVE' ||
      accounts.length === 0 ||
      accounts.length !== candidates.length
    ) {
      throw new BadGatewayException(
        'Monnify returned an incomplete account reservation',
      );
    }

    return {
      reservationReference: body.reservationReference,
      accounts: accounts.map((account) => ({
        bankCode: account.bankCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
      })),
    };
  }

  private requireEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Funding accounts are disabled',
      );
    }
  }

  private requireReference(reference: string): string {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(reference)) {
      throw new BadRequestException('Invalid account reference');
    }

    return reference;
  }

  private contractCode(): string {
    const code = this.config.get<string>('MONNIFY_CONTRACT_CODE')?.trim();

    if (!code) {
      throw new ServiceUnavailableException(
        'Monnify contract code is not configured',
      );
    }

    return code;
  }
}