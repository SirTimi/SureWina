import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MonnifyClientService } from './monnify-client.service';

const BVN_DETAILS_MATCH_PATH = '/api/v1/vas/bvn-details-match';
const BVN_ACCOUNT_MATCH_PATH = '/api/v1/vas/bvn-account-match';

export type BvnAccountMatchInput = {
  bvn: string;
  bankCode: string;
  accountNumber: string;
};

// Whether a bank account belongs to the holder of a BVN.
export type BvnAccountMatchResult =
  | { outcome: 'MATCHED'; accountName: string }
  | { outcome: 'NOT_MATCHED' };

type RawBvnAccountMatch = {
  bvn?: string;
  accountNumber?: string;
  accountName?: string;
  matchStatus?: string;
  matchPercentage?: number;
};

const MATCH_STATUSES = ['FULL_MATCH', 'PARTIAL_MATCH', 'NO_MATCH'] as const;

export type BvnMatchStatus = (typeof MATCH_STATUSES)[number];

export type BvnDetailsMatchInput = {
  bvn: string;
  // The full name as the customer gave it. Monnify compares it word by word
  // against the BVN record, so a subset of the registered names still counts
  // as a full match.
  name: string;
  // YYYY-MM-DD. Converted to Monnify's own format here.
  dateOfBirth: string;
  // 11-13 digits, local or international form.
  mobileNo: string;
};

export type BvnDetailsMatchResult =
  | {
      outcome: 'CHECKED';
      name: BvnMatchStatus;
      dateOfBirth: BvnMatchStatus;
      mobileNo: BvnMatchStatus;
    }
  // Monnify rejected the number itself. Distinct from a mismatch: there is no
  // record to compare against, and nothing was charged.
  | { outcome: 'INVALID_BVN' };

type RawBvnDetailsMatch = {
  bvn?: string;
  name?: { matchStatus?: string; matchPercentage?: number };
  dateOfBirth?: string;
  mobileNo?: string;
};

// Sandbox stand-ins for Monnify's live-only BVN checks. Each answers in the
// shape Monnify documents, so everything after the check runs as it would
// on live.
export const SANDBOX_TEST_BVNS = {
  // Every detail matches; any bank account matches unless it ends in 0000.
  MATCH: '22222222222',
  // The BVN record exists but the name does not match; no account matches.
  MISMATCH: '33333333333',
  // Monnify does not recognise the number.
  INVALID: '11111111111',
} as const;

const SANDBOX_ACCOUNT_NAME = 'SANDBOX TEST ACCOUNT';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// BVN Information Verification — checks the details a customer supplies
// against their BVN record.
//
// Live environment only: Monnify does not offer it in sandbox (for sandbox
// testing, see MONNIFY_SANDBOX_VERIFICATION_MOCK). Each
// successful check costs ₦10 from the Monnify wallet balance, and requests
// fail outright if that balance is too low. Disabled by default so neither
// cost nor failure can happen by accident.
@Injectable()
export class MonnifyVerificationService {
  private readonly logger = new Logger(MonnifyVerificationService.name);

  constructor(
    private readonly client: MonnifyClientService,
    private readonly config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return (
      this.config.get<boolean>(
        'MONNIFY_IDENTITY_VERIFICATION_ENABLED',
      ) === true
    );
  }

  // True only when the sandbox stand-in is switched on AND the Monnify
  // settings are unmistakably the sandbox's. Switched on anywhere else, it
  // refuses every check: a live BVN check must never be faked.
  private useSandboxMock(): boolean {
    if (
      this.config.get<boolean>('MONNIFY_SANDBOX_VERIFICATION_MOCK') !== true
    ) {
      return false;
    }

    let host = '';

    try {
      host = new URL(
        this.config.get<string>('MONNIFY_BASE_URL') ?? '',
      ).hostname;
    } catch {
      host = '';
    }

    const apiKey = this.config.get<string>('MONNIFY_API_KEY') ?? '';

    if (host === 'sandbox.monnify.com' && apiKey.startsWith('MK_TEST_')) {
      return true;
    }

    this.logger.error(
      'MONNIFY_SANDBOX_VERIFICATION_MOCK is on, but Monnify is not configured for the sandbox. BVN checks are refused.',
    );

    throw new ServiceUnavailableException(
      'Identity verification is misconfigured',
    );
  }

  async matchBvnDetails(
    input: BvnDetailsMatchInput,
  ): Promise<BvnDetailsMatchResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Identity verification is disabled',
      );
    }

    if (!/^\d{11}$/.test(input.bvn)) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    if (!/^\d{11,13}$/.test(input.mobileNo)) {
      throw new BadRequestException(
        'A mobile number must be 11 to 13 digits',
      );
    }

    if (this.useSandboxMock()) {
      return this.sandboxDetailsMatch(input.bvn);
    }

    const result = await this.client.request<RawBvnDetailsMatch>(
      BVN_DETAILS_MATCH_PATH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bvn: input.bvn,
          name: input.name,
          dateOfBirth: this.monnifyDate(input.dateOfBirth),
          mobileNo: input.mobileNo,
        }),
      },
    );

    const payload = result.payload;

    if (
      result.httpStatus >= 200 &&
      result.httpStatus < 300 &&
      payload?.requestSuccessful === true &&
      payload.responseCode === '0' &&
      payload.responseBody
    ) {
      const body = payload.responseBody;

      const name = this.status(body.name?.matchStatus);
      const dateOfBirth = this.status(body.dateOfBirth);
      const mobileNo = this.status(body.mobileNo);

      // A response missing any status cannot be judged either way. Treat it
      // as an upstream fault — never as a pass.
      if (!name || !dateOfBirth || !mobileNo) {
        throw new BadGatewayException(
          'Identity verification returned an incomplete result',
        );
      }

      return { outcome: 'CHECKED', name, dateOfBirth, mobileNo };
    }

    if (/invalid bvn/i.test(payload?.responseMessage ?? '')) {
      return { outcome: 'INVALID_BVN' };
    }

    // The BVN never appears in logs.
    this.logger.error(
      `BVN verification failed: HTTP ${result.httpStatus}, code ${payload?.responseCode ?? 'none'}`,
    );

    throw new BadGatewayException(
      'Identity verification is unavailable right now',
    );
  }

  // BVN and Account Name Match: does this bank account belong to the
  // person who holds this BVN? Used before a withdrawal account is saved, so
  // money only ever leaves to the owner's own account.
  //
  // Only FULL_MATCH counts. Monnify's documentation shows no other status,
  // so anything else — a partial match, an unknown value — is treated as no
  // match rather than guessed at.
  async matchBvnToAccount(
    input: BvnAccountMatchInput,
  ): Promise<BvnAccountMatchResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'Identity verification is disabled',
      );
    }

    if (!/^\d{11}$/.test(input.bvn)) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    if (!/^\d{3,10}$/.test(input.bankCode)) {
      throw new BadRequestException('Invalid bank code');
    }

    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw new BadRequestException(
        'Bank account number must contain exactly 10 digits',
      );
    }

    if (this.useSandboxMock()) {
      return this.sandboxAccountMatch(input.bvn, input.accountNumber);
    }

    const result = await this.client.request<RawBvnAccountMatch>(
      BVN_ACCOUNT_MATCH_PATH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bvn: input.bvn,
          bankCode: input.bankCode,
          accountNumber: input.accountNumber,
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
      const body = payload.responseBody;
      const accountName = body.accountName?.trim();

      if (
        body.matchStatus?.trim().toUpperCase() === 'FULL_MATCH' &&
        body.accountNumber === input.accountNumber &&
        accountName
      ) {
        return { outcome: 'MATCHED', accountName };
      }

      return { outcome: 'NOT_MATCHED' };
    }

    // Neither the BVN nor the account number appears in logs.
    this.logger.error(
      `BVN account match failed: HTTP ${result.httpStatus}, code ${payload?.responseCode ?? 'none'}`,
    );

    throw new BadGatewayException(
      'Account verification is unavailable right now',
    );
  }

  private sandboxDetailsMatch(bvn: string): BvnDetailsMatchResult {
    this.logger.warn('BVN details check answered by the sandbox stand-in');

    if (bvn === SANDBOX_TEST_BVNS.MATCH) {
      return {
        outcome: 'CHECKED',
        name: 'FULL_MATCH',
        dateOfBirth: 'FULL_MATCH',
        mobileNo: 'FULL_MATCH',
      };
    }

    if (bvn === SANDBOX_TEST_BVNS.MISMATCH) {
      return {
        outcome: 'CHECKED',
        name: 'NO_MATCH',
        dateOfBirth: 'FULL_MATCH',
        mobileNo: 'NO_MATCH',
      };
    }

    return { outcome: 'INVALID_BVN' };
  }

  private sandboxAccountMatch(
    bvn: string,
    accountNumber: string,
  ): BvnAccountMatchResult {
    this.logger.warn('BVN account match answered by the sandbox stand-in');

    if (bvn === SANDBOX_TEST_BVNS.MATCH && !accountNumber.endsWith('0000')) {
      return { outcome: 'MATCHED', accountName: SANDBOX_ACCOUNT_NAME };
    }

    return { outcome: 'NOT_MATCHED' };
  }

  private status(value: unknown): BvnMatchStatus | null {
    return MATCH_STATUSES.includes(value as BvnMatchStatus)
      ? (value as BvnMatchStatus)
      : null;
  }

  // YYYY-MM-DD → DD-Mon-YYYY, the format in Monnify's own examples.
  private monnifyDate(isoDate: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

    if (!match) {
      throw new BadRequestException('Date of birth must use YYYY-MM-DD');
    }

    const [, year, month, day] = match;
    const monthIndex = Number(month) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException('Invalid date of birth');
    }

    return `${day}-${MONTHS[monthIndex]}-${year}`;
  }
}