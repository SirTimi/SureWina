import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  MonnifyClientService,
} from '../../integrations/monnify/monnify-client.service';

export type ResolvedBankAccount = {
  accountNumber: string;
  accountName: string;
  bankCode: string;
};

type MonnifyAccountValidationBody = {
  accountNumber?: string;
  accountName?: string;
  bankCode?: string;
};

@Injectable()
export class BankResolveService {
  private readonly logger =
    new Logger(BankResolveService.name);

  constructor(
    private readonly monnify:
      MonnifyClientService,
  ) {}

  async resolve(
    accountNumber: string,
    bankCode: string,
  ): Promise<ResolvedBankAccount> {
    const path =
      '/api/v2/disbursements/account/validate' +
      `?accountNumber=${encodeURIComponent(
        accountNumber,
      )}` +
      `&bankCode=${encodeURIComponent(
        bankCode,
      )}`;

    const result =
      await this.monnify.request<MonnifyAccountValidationBody>(
        path,
        {
          method: 'GET',
        },
      );

    const payload = result.payload;
    const body = payload?.responseBody;

    if (
      !payload?.requestSuccessful ||
      !body?.accountName
    ) {
      this.logger.warn(
        `Monnify bank resolve failed (${result.httpStatus}): ${
          payload?.responseMessage ??
          'no response body'
        }`,
      );

      throw new BadRequestException(
        'Could not resolve this account. Check the account number and bank code.',
      );
    }

    return {
      accountNumber:
        body.accountNumber ??
        accountNumber,

      accountName:
        body.accountName,

      bankCode:
        body.bankCode ??
        bankCode,
    };
  }
}