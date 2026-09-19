import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import {
  TreasuryAccountKind,
  TreasuryAccountStatus,
  TreasuryProvider,
} from '@prisma/client';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../database/prisma.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';

type TreasurySeed = {
  code: string;
  name: string;
  provider: TreasuryProvider;
  kind: TreasuryAccountKind;
  ledgerCode: string;
  externalAccountReference?: string | null;
  bankCode?: string | null;
  accountLast4?: string | null;
};

@Injectable()
export class TreasuryBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger =
    new Logger(TreasuryBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const seeds: TreasurySeed[] = [
      {
        code: 'TRSY:MONNIFY:COLLECTION',
        name: 'Monnify Collection Clearing',
        provider: TreasuryProvider.MONNIFY,
        kind: TreasuryAccountKind.COLLECTION_CLEARING,
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_COLLECTION_CLEARING,
      },
      {
        code: 'TRSY:FLUTTERWAVE:COLLECTION',
        name: 'Flutterwave Collection Clearing',
        provider: TreasuryProvider.FLUTTERWAVE,
        kind: TreasuryAccountKind.COLLECTION_CLEARING,
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_CLEARING,
      },
      {
        code: 'TRSY:MONNIFY:PAYOUT',
        name: 'Monnify Payout Wallet',
        provider: TreasuryProvider.MONNIFY,
        kind: TreasuryAccountKind.PAYOUT_WALLET,
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.MONNIFY_PAYOUT_CLEARING,
        externalAccountReference:
          this.config.get<string>(
            'MONNIFY_SOURCE_ACCOUNT_NUMBER',
          ) || null,
      },
      {
        code: 'TRSY:FLUTTERWAVE:PAYOUT',
        name: 'Flutterwave NGN Payout Wallet',
        provider: TreasuryProvider.FLUTTERWAVE,
        kind: TreasuryAccountKind.PAYOUT_WALLET,
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.FLUTTERWAVE_PAYOUT_CLEARING,
        externalAccountReference:
          'MAIN_NGN_WALLET',
      },
      {
        code: 'TRSY:BANK:PRIMARY',
        name: 'SureWina Primary Bank',
        provider: TreasuryProvider.BANK,
        kind: TreasuryAccountKind.BANK_ACCOUNT,
        ledgerCode:
          SYSTEM_LEDGER_ACCOUNT_CODES.BANK_CASH,
        externalAccountReference:
          this.config.get<string>(
            'TREASURY_BANK_REFERENCE',
          ) || null,
        bankCode:
          this.config.get<string>(
            'TREASURY_BANK_CODE',
          ) || null,
        accountLast4:
          this.config.get<string>(
            'TREASURY_BANK_ACCOUNT_LAST4',
          ) || null,
      },
    ];

    for (const seed of seeds) {
      const ledgerAccount =
        await this.prisma.ledgerAccount.findUnique({
          where: {
            code: seed.ledgerCode,
          },
        });

      if (!ledgerAccount) {
        throw new Error(
          `Treasury bootstrap requires ledger account ${seed.ledgerCode}`,
        );
      }

      const existing =
        await this.prisma.treasuryAccount.findUnique({
          where: {
            code: seed.code,
          },
        });

      if (existing) {
        if (
          existing.ledgerAccountId !==
            ledgerAccount.accountId ||
          existing.provider !==
            seed.provider ||
          existing.kind !==
            seed.kind ||
          existing.currency !==
            'NGN'
        ) {
          throw new Error(
            `Treasury account ${seed.code} exists with different identity`,
          );
        }

        await this.prisma.treasuryAccount.update({
          where: {
            treasuryAccountId:
              existing.treasuryAccountId,
          },
          data: {
            name: seed.name,
            externalAccountReference:
              seed.externalAccountReference ??
              null,
            bankCode:
              seed.bankCode ??
              null,
            accountLast4:
              seed.accountLast4 ??
              null,
            status:
              TreasuryAccountStatus.ACTIVE,
          },
        });

        continue;
      }

      await this.prisma.treasuryAccount.create({
        data: {
          code: seed.code,
          name: seed.name,
          provider:
            seed.provider,
          kind:
            seed.kind,
          currency:
            'NGN',
          ledgerAccountId:
            ledgerAccount.accountId,
          externalAccountReference:
            seed.externalAccountReference ??
            null,
          bankCode:
            seed.bankCode ??
            null,
          accountLast4:
            seed.accountLast4 ??
            null,
          status:
            TreasuryAccountStatus.ACTIVE,
        },
      });
    }

    this.logger.log(
      `Treasury registry ready (${seeds.length} accounts)`,
    );
  }
}
