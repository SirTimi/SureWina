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

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// BVN Information Verification — checks the details a customer supplies
// against their BVN record.
//
// Live environment only: Monnify does not offer it in sandbox. Each
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