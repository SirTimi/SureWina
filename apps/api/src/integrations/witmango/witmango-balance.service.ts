import { Injectable, Logger } from '@nestjs/common';

import {
  LedgerOwnerType,
  WitmangoWalletLinkStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { WitmangoClientService } from './witmango-client.service';
import {
  WitmangoWalletLinkService,
  WitmangoWalletState,
} from './witmango-wallet-link.service';

export type CbaAccountBalance = {
  purpose: WitmangoWalletPurpose;
  // What can be spent or withdrawn now.
  availableNgn: number;
  // The book balance, including anything the CBA itself holds back.
  balanceNgn: number;
};

export type CbaBalancesView = {
  state: WitmangoWalletState;
  // False when the wallet is ready but its balances could not be read. The
  // app shows "unavailable" then — never a zero it does not know to be true.
  available: boolean;
  accounts: CbaAccountBalance[];
  // Deposit + Winnings, or Float + Earnings.
  spendableNgn: number | null;
  // Winnings, or Earnings: the only money that can leave the wallet.
  withdrawableNgn: number | null;
};

const SPEND_PURPOSES: Record<string, WitmangoWalletPurpose[]> = {
  [LedgerOwnerType.CUSTOMER]: [WitmangoWalletPurpose.DEPOSIT, WitmangoWalletPurpose.WINNINGS],
  [LedgerOwnerType.AGENT]: [WitmangoWalletPurpose.FLOAT],
};

const WITHDRAW_PURPOSE: Record<string, WitmangoWalletPurpose> = {
  [LedgerOwnerType.CUSTOMER]: WitmangoWalletPurpose.WINNINGS,
  [LedgerOwnerType.AGENT]: WitmangoWalletPurpose.EARNINGS,
};

// Balances read live from the CBA, which holds the money once a wallet has
// moved onto it. SureWina keeps no copy that could drift from the CBA's.
@Injectable()
export class WitmangoBalanceService {
  private readonly logger = new Logger(WitmangoBalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly witmango: WitmangoClientService,
    private readonly links: WitmangoWalletLinkService,
  ) {}

  async getBalances(walletId: string): Promise<CbaBalancesView> {
    const state = await this.links.getState(walletId);

    if (state !== 'READY') {
      return { state, available: true, accounts: [], spendableNgn: null, withdrawableNgn: null };
    }

    const [wallet, links] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { walletId }, select: { ownerType: true } }),
      this.prisma.witmangoWalletLink.findMany({
        where: { walletId, status: WitmangoWalletLinkStatus.ACTIVE },
        orderBy: { purpose: 'asc' },
      }),
    ]);

    try {
      const accounts = await Promise.all(
        links.map(async (link): Promise<CbaAccountBalance> => {
          const account = await this.witmango.getSavingsAccount(link.savingsAccountId as number);

          return {
            purpose: link.purpose,
            availableNgn: account.summary.availableBalance,
            balanceNgn: account.summary.accountBalance,
          };
        }),
      );

      const ownerType = wallet?.ownerType ?? LedgerOwnerType.CUSTOMER;
      const spend = SPEND_PURPOSES[ownerType] ?? [];
      const withdraw = WITHDRAW_PURPOSE[ownerType];

      return {
        state,
        available: true,
        accounts,
        spendableNgn: accounts
          .filter((a) => spend.includes(a.purpose))
          .reduce((sum, a) => sum + a.availableNgn, 0),
        withdrawableNgn:
          accounts.find((a) => a.purpose === withdraw)?.availableNgn ?? 0,
      };
    } catch (error) {
      this.logger.warn(
        `Balances unavailable for wallet ${walletId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      return { state, available: false, accounts: [], spendableNgn: null, withdrawableNgn: null };
    }
  }
}
