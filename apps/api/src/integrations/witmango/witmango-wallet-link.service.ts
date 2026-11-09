
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  KycStatus,
  LedgerOwnerType,
  WalletStatus,
  WitmangoWalletLinkStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { WalletService } from '../../wallet/wallet.service';

import {
  WitmangoClientService,
} from './witmango-client.service';

export type ProvisionWitmangoWalletInput = {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  consent: boolean;
};

// The CBA accounts each kind of owner holds. The first is opened together
// with the client; the second is added to that client afterwards.
//
// Two accounts rather than one because the withdrawal rule depends on where
// money came from. A single balance cannot tell deposited naira from won
// naira, so it cannot enforce "only winnings can be withdrawn".
const PURPOSES_BY_OWNER: Partial<
  Record<LedgerOwnerType, readonly [WitmangoWalletPurpose, WitmangoWalletPurpose]>
> = {
  [LedgerOwnerType.CUSTOMER]: [
    WitmangoWalletPurpose.DEPOSIT,
    WitmangoWalletPurpose.WINNINGS,
  ],
  [LedgerOwnerType.AGENT]: [
    WitmangoWalletPurpose.FLOAT,
    WitmangoWalletPurpose.EARNINGS,
  ],
};

// One CBA savings product per purpose. Separate products carry separate GL
// mappings, so the books show deposits and winnings as distinct liabilities
// without anyone tagging individual transactions.
const PRODUCT_SETTING: Record<WitmangoWalletPurpose, string> = {
  [WitmangoWalletPurpose.DEPOSIT]: 'WITMANGO_DEPOSIT_PRODUCT_ID',
  [WitmangoWalletPurpose.WINNINGS]: 'WITMANGO_WINNINGS_PRODUCT_ID',
  [WitmangoWalletPurpose.FLOAT]: 'WITMANGO_FLOAT_PRODUCT_ID',
  [WitmangoWalletPurpose.EARNINGS]: 'WITMANGO_EARNINGS_PRODUCT_ID',
};

@Injectable()
export class WitmangoWalletLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletService,
    private readonly witmango: WitmangoClientService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private tenantId(): string {
    const tenant = this.config
      .get<string>('WITMANGO_TENANT_ID')
      ?.trim();

    if (!tenant) {
      throw new ServiceUnavailableException(
        'Witmango tenant is not configured',
      );
    }

    return tenant;
  }

  private positiveConfig(name: string): number {
    const value = Number(this.config.get(name));

    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(
        `${name} must be configured`,
      );
    }

    return value;
  }

  async getLink(walletId: string) {
    const links = await this.prisma.witmangoWalletLink.findMany({
      where: { walletId },
      orderBy: { purpose: 'asc' },
    });

    if (links.length === 0) {
      throw new NotFoundException(
        'No Witmango wallet mapping exists',
      );
    }

    const tenantId = this.tenantId();

    if (links.some((link) => link.tenantId !== tenantId)) {
      throw new ConflictException(
        'Witmango wallet belongs to another configured tenant',
      );
    }

    return {
      walletId,
      accounts: links.map((link) => ({
        purpose: link.purpose,
        status: link.status,
        clientId: link.clientId,
        savingsAccountId: link.savingsAccountId,
        lastReconciledAt:
          link.lastReconciledAt?.toISOString() ?? null,
      })),
    };
  }

  // The single way later code should reach a CBA account: by wallet and
  // purpose, and only once it is fully active. Anything that moves money
  // must go through this, so a half-provisioned account is never used.
  async getActiveAccount(
    walletId: string,
    purpose: WitmangoWalletPurpose,
  ): Promise<{ clientId: number; savingsAccountId: number }> {
    const link = await this.prisma.witmangoWalletLink.findUnique({
      where: {
        walletId_purpose: { walletId, purpose },
      },
    });

    if (
      !link ||
      link.tenantId !== this.tenantId() ||
      link.status !== WitmangoWalletLinkStatus.ACTIVE ||
      !link.clientId ||
      !link.savingsAccountId
    ) {
      throw new ConflictException(
        `The ${purpose.toLowerCase()} CBA account is not ready`,
      );
    }

    return {
      clientId: link.clientId,
      savingsAccountId: link.savingsAccountId,
    };
  }

  // One entry point for both owner types. Each has its own eligibility
  // rules; once a wallet passes them, both go through the same provisioning
  // core — a sequence too delicate to keep in two copies that could drift.
  async provision(
    walletId: string,
    input: ProvisionWitmangoWalletInput,
    adminId: string,
  ) {
    if (
      !this.witmango.isEnabled() ||
      this.config.get<boolean>(
        'WITMANGO_PROVISIONING_ENABLED',
      ) !== true
    ) {
      throw new ServiceUnavailableException(
        'Witmango provisioning is disabled',
      );
    }

    if (input.consent !== true) {
      throw new BadRequestException(
        'Documented consent is required',
      );
    }

    const wallet = await this.wallets.getWallet(walletId);

    const purposes = PURPOSES_BY_OWNER[
      wallet.ownerType as LedgerOwnerType
    ];

    if (
      !purposes ||
      !wallet.ownerId ||
      wallet.status !== WalletStatus.ACTIVE ||
      wallet.currency !== 'NGN'
    ) {
      throw new ConflictException(
        'Only active NGN customer or agent wallets can be provisioned',
      );
    }

    // Do not silently migrate existing money.
    // A funded wallet requires an approved balance
    // migration and reconciliation procedure.
    if (
      wallet.availableNgn !== 0 ||
      wallet.heldNgn !== 0 ||
      wallet.totalNgn !== 0
    ) {
      throw new ConflictException(
        'Funded wallets require controlled migration before CBA provisioning',
      );
    }

    if (wallet.ownerType === LedgerOwnerType.CUSTOMER) {
      await this.requireEligibleCustomer(wallet.ownerId, input);
    } else {
      await this.requireEligibleAgent(wallet.ownerId, input);
    }

    return this.provisionPair(
      walletId,
      wallet.ownerType as LedgerOwnerType,
      purposes,
      input,
      adminId,
    );
  }

  private async requireEligibleCustomer(
    userId: string,
    input: ProvisionWitmangoWalletInput,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        kycStatus: true,
      },
    });

    if (
      !user ||
      user.kycStatus !== KycStatus.TIER1_COMPLETE
    ) {
      throw new ConflictException(
        'Customer KYC must be completed before CBA onboarding',
      );
    }

    this.requireMatchingEmail(user.email, input.email, 'Customer');
  }

  private async requireEligibleAgent(
    agentId: string,
    input: ProvisionWitmangoWalletInput,
  ): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: { agentId },
      select: {
        agentId: true,
        email: true,
        status: true,
        walletBalanceNgn: true,
      },
    });

    // ACTIVE means compliance has approved the agent. Opening CBA accounts
    // for someone still in onboarding, or suspended, would put a person on
    // the books whom the business has not cleared to hold money.
    if (!agent || agent.status !== AgentStatus.ACTIVE) {
      throw new ConflictException(
        'Only active, compliance-approved agents can be provisioned',
      );
    }

    // The legacy balance column predates the ledger. Money there would sit
    // somewhere the CBA never hears about, so it must be migrated first —
    // never carried across silently.
    if (agent.walletBalanceNgn !== 0) {
      throw new ConflictException(
        'Agent holds a legacy balance that must be migrated before CBA provisioning',
      );
    }

    // Email is optional on agents, but the CBA client needs one. Refuse
    // rather than invent an address on someone's behalf.
    if (!agent.email) {
      throw new ConflictException(
        'Agent has no registered email. Add one before CBA onboarding',
      );
    }

    this.requireMatchingEmail(agent.email, input.email, 'Agent');
  }

  private requireMatchingEmail(
    registered: string | null,
    supplied: string,
    who: 'Customer' | 'Agent',
  ): void {
    if (
      !registered ||
      registered.trim().toLowerCase() !==
        supplied.trim().toLowerCase()
    ) {
      throw new ConflictException(
        `${who} email must match the registered account`,
      );
    }
  }

  private async provisionPair(
    walletId: string,
    ownerType: LedgerOwnerType,
    [primary, secondary]: readonly [WitmangoWalletPurpose, WitmangoWalletPurpose],
    input: ProvisionWitmangoWalletInput,
    adminId: string,
  ) {
    const existing =
      await this.prisma.witmangoWalletLink.findMany({
        where: { walletId },
        select: { purpose: true },
      });

    if (existing.length > 0) {
      throw new ConflictException(
        'A Witmango provisioning attempt already exists. Reconcile it instead of creating another wallet.',
      );
    }

    // Every setting is resolved BEFORE anything is reserved. A missing
    // product ID is a configuration problem, and should fail cleanly rather
    // than leave records stuck in review for something that never reached
    // the CBA.
    const tenantId = this.tenantId();

    const officeId = this.positiveConfig('WITMANGO_OFFICE_ID');
    const legalFormId = this.positiveConfig('WITMANGO_LEGAL_FORM_ID');

    const primaryProductId = this.positiveConfig(
      PRODUCT_SETTING[primary],
    );

    const secondaryProductId = this.positiveConfig(
      PRODUCT_SETTING[secondary],
    );

    // The whole point of two products is two GL lines. Sharing one would
    // quietly put both kinds of money back into the same liability.
    if (primaryProductId === secondaryProductId) {
      throw new ServiceUnavailableException(
        `${primary} and ${secondary} wallets must use different CBA savings products`,
      );
    }

    // Opaque, stable identifiers without PII.
    const clientExternalId = `sw-${walletId}`;
    const secondaryExternalId =
      `sw-${walletId}-${secondary.toLowerCase()}`;

    // Reserve both linkages BEFORE contacting Fineract, in one statement so
    // they exist together or not at all. The (walletId, purpose) uniqueness
    // stops a concurrent request reserving the same accounts.
    await this.prisma.witmangoWalletLink.createMany({
      data: [
        {
          walletId,
          purpose: primary,
          tenantId,
          clientExternalId,
          savingsProductId: primaryProductId,
          status: WitmangoWalletLinkStatus.PROVISIONING,
        },
        {
          walletId,
          purpose: secondary,
          tenantId,
          clientExternalId,
          accountExternalId: secondaryExternalId,
          savingsProductId: secondaryProductId,
          status: WitmangoWalletLinkStatus.PROVISIONING,
        },
      ],
    });

    try {
      const created =
        await this.witmango.createClientWithWallet({
          officeId,
          legalFormId,
          savingsProductId: primaryProductId,
          externalId: clientExternalId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
        });

      // Persist identifiers as soon as we know them.
      // If a later step fails, they remain available
      // for manual recovery.
      await this.prisma.witmangoWalletLink.update({
        where: {
          walletId_purpose: { walletId, purpose: primary },
        },
        data: {
          clientId: created.clientId,
          savingsAccountId: created.savingsAccountId,
        },
      });

      const opened =
        await this.witmango.openSavingsAccount({
          clientId: created.clientId,
          savingsProductId: secondaryProductId,
          externalId: secondaryExternalId,
        });

      await this.prisma.witmangoWalletLink.update({
        where: {
          walletId_purpose: { walletId, purpose: secondary },
        },
        data: {
          clientId: created.clientId,
          savingsAccountId: opened.savingsAccountId,
        },
      });

      if (opened.savingsAccountId === created.savingsAccountId) {
        throw new ConflictException(
          'Witmango returned the same account for both wallets',
        );
      }

      for (const accountId of [
        created.savingsAccountId,
        opened.savingsAccountId,
      ]) {
        const account =
          await this.witmango.getSavingsAccount(accountId);

        if (
          account.status.id !== 300 ||
          account.summary.accountBalance !== 0 ||
          account.summary.availableBalance !== 0
        ) {
          throw new ConflictException(
            'New Witmango wallet requires reconciliation before activation',
          );
        }
      }

      // Both accounts go live together. Half a pair is worse than none:
      // a customer could buy a ticket with nowhere for a prize to land, or
      // an agent could sell with nowhere for commission to go.
      await this.prisma.witmangoWalletLink.updateMany({
        where: { walletId },
        data: {
          status: WitmangoWalletLinkStatus.ACTIVE,
        },
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminId,
        },
        action: 'WITMANGO_WALLET_PROVISIONED',
        resource: {
          type: 'Wallet',
          id: walletId,
        },
        metadata: {
          ownerType,
          clientId: created.clientId,
          tenantId,
          accounts: {
            [primary]: created.savingsAccountId,
            [secondary]: opened.savingsAccountId,
          },
        },
      });

      return {
        walletId,
        ownerType,
        status: WitmangoWalletLinkStatus.ACTIVE,
        clientId: created.clientId,
        accounts: [
          {
            purpose: primary,
            savingsAccountId: created.savingsAccountId,
          },
          {
            purpose: secondary,
            savingsAccountId: opened.savingsAccountId,
          },
        ],
      };
    } catch {
      // Either upstream account MAY have been created.
      // Never automatically repeat a creation call.
      await this.prisma.witmangoWalletLink.updateMany({
        where: { walletId },
        data: {
          status: WitmangoWalletLinkStatus.REVIEW_REQUIRED,
        },
      });

      throw new ServiceUnavailableException(
        'Witmango provisioning requires reconciliation. Do not retry wallet creation automatically.',
      );
    }
  }

  private toKobo(value: number): number {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isSafeInteger(Math.round(value * 100)) ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001
    ) {
      throw new ConflictException(
        'Invalid external NGN balance precision',
      );
    }

    return Math.round(value * 100);
  }

  // Compares SureWina's ledger against the CBA. Transitional: SureWina
  // still keeps one balance per wallet, so it is compared against the SUM
  // of that wallet's CBA accounts. Once balances live only in the CBA, this
  // becomes the vault-versus-book check instead.
  async reconcile(walletId: string) {
    const links = await this.prisma.witmangoWalletLink.findMany({
      where: { walletId },
    });

    if (links.length === 0) {
      throw new NotFoundException(
        'Witmango wallet mapping not found',
      );
    }

    const internal =
      await this.wallets.getWallet(walletId);

    const expected = PURPOSES_BY_OWNER[
      internal.ownerType as LedgerOwnerType
    ];

    const tenantId = this.tenantId();

    if (
      !expected ||
      links.length !== expected.length ||
      !expected.every((purpose) =>
        links.some((link) => link.purpose === purpose),
      ) ||
      links.some(
        (link) =>
          link.tenantId !== tenantId ||
          link.status !== WitmangoWalletLinkStatus.ACTIVE ||
          !link.savingsAccountId,
      )
    ) {
      throw new ConflictException(
        'Witmango wallet linkage is not ready for reconciliation',
      );
    }

    const internalAvailableKobo =
      internal.availableNgn * 100;

    const internalTotalKobo =
      internal.totalNgn * 100;

    if (
      !Number.isSafeInteger(internalAvailableKobo) ||
      !Number.isSafeInteger(internalTotalKobo)
    ) {
      throw new ConflictException(
        'Internal wallet balance exceeds supported precision',
      );
    }

    const differences: string[] = [];

    let externalAvailableKobo = 0;
    let externalTotalKobo = 0;

    const accounts: {
      purpose: WitmangoWalletPurpose;
      savingsAccountId: number;
      availableNgn: number;
      totalNgn: number;
    }[] = [];

    for (const link of links) {
      const external =
        await this.witmango.getSavingsAccount(
          link.savingsAccountId!,
        );

      if (
        external.status.id !== 300 &&
        !differences.includes('EXTERNAL_ACCOUNT_STATUS')
      ) {
        differences.push('EXTERNAL_ACCOUNT_STATUS');
      }

      externalAvailableKobo += this.toKobo(
        external.summary.availableBalance,
      );

      externalTotalKobo += this.toKobo(
        external.summary.accountBalance,
      );

      accounts.push({
        purpose: link.purpose,
        savingsAccountId: link.savingsAccountId!,
        availableNgn: external.summary.availableBalance,
        totalNgn: external.summary.accountBalance,
      });
    }

    if (internal.currency !== 'NGN') {
      differences.push('INTERNAL_CURRENCY');
    }

    if (internal.status !== WalletStatus.ACTIVE) {
      differences.push('INTERNAL_WALLET_STATUS');
    }

    if (
      internalAvailableKobo !== externalAvailableKobo
    ) {
      differences.push('AVAILABLE_BALANCE');
    }

    if (internalTotalKobo !== externalTotalKobo) {
      differences.push('TOTAL_BALANCE');
    }

    const checkedAt = new Date();

    await this.prisma.witmangoWalletLink.updateMany({
      where: { walletId },
      data: {
        lastReconciledAt: checkedAt,
      },
    });

    // Read-only balance comparison.
    // Never repair a difference by issuing a deposit
    // or withdrawal behind the finance team's back.
    return {
      walletId,
      status: differences.length === 0
        ? 'MATCHED'
        : 'MISMATCH',

      checkedAt: checkedAt.toISOString(),

      internal: {
        availableNgn: internal.availableNgn,
        heldNgn: internal.heldNgn,
        totalNgn: internal.totalNgn,
      },

      external: {
        availableNgn: externalAvailableKobo / 100,
        totalNgn: externalTotalKobo / 100,
        accounts,
      },

      differences,
    };
  }
}