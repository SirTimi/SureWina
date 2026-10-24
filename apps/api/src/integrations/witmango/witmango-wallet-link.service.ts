
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AuditActorType,
  AuditSeverity,
  KycStatus,
  LedgerOwnerType,
  WalletStatus,
  WitmangoWalletLinkStatus,
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
    const link = await this.prisma.witmangoWalletLink.findUnique({
      where: { walletId },
    });

    if (!link) {
      throw new NotFoundException(
        'No Witmango wallet mapping exists',
      );
    }

    if (link.tenantId !== this.tenantId()) {
      throw new ConflictException(
        'Witmango wallet belongs to another configured tenant',
      );
    }

    return {
      walletId: link.walletId,
      status: link.status,
      clientId: link.clientId,
      savingsAccountId: link.savingsAccountId,
      lastReconciledAt:
        link.lastReconciledAt?.toISOString() ?? null,
    };
  }

  async provisionCustomer(
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
        'Documented customer consent is required',
      );
    }

    // Only controlled first-time customer onboarding
    // is enabled in this implementation.
    const wallet = await this.wallets.getWallet(walletId);

    if (
      wallet.ownerType !== LedgerOwnerType.CUSTOMER ||
      !wallet.ownerId ||
      wallet.status !== WalletStatus.ACTIVE ||
      wallet.currency !== 'NGN'
    ) {
      throw new ConflictException(
        'Only active NGN customer wallets can be provisioned',
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

    const user = await this.prisma.user.findUnique({
      where: {
        userId: wallet.ownerId,
      },
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

    if (
      !user.email ||
      user.email.trim().toLowerCase() !==
        input.email.trim().toLowerCase()
    ) {
      throw new ConflictException(
        'Customer email must match the registered account',
      );
    }

    const existing =
      await this.prisma.witmangoWalletLink.findUnique({
        where: { walletId },
      });

    if (existing) {
      throw new ConflictException(
        'A Witmango provisioning attempt already exists. Reconcile it instead of creating another wallet.',
      );
    }

    const tenantId = this.tenantId();

    // Opaque, stable identifier without customer PII.
    const externalId = `sw-${walletId}`;

    // Reserve the linkage BEFORE contacting Fineract.
    // walletId uniqueness prevents a normal duplicate
    // provisioning request.
    await this.prisma.witmangoWalletLink.create({
      data: {
        walletId,
        tenantId,
        clientExternalId: externalId,
        status: WitmangoWalletLinkStatus.PROVISIONING,
      },
    });

    try {
      const created =
        await this.witmango.createClientWithWallet({
          officeId: this.positiveConfig(
            'WITMANGO_OFFICE_ID',
          ),
          legalFormId: this.positiveConfig(
            'WITMANGO_LEGAL_FORM_ID',
          ),
          savingsProductId: this.positiveConfig(
            'WITMANGO_SAVINGS_PRODUCT_ID',
          ),
          externalId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
        });

      // Persist identifiers as soon as we know them.
      // If subsequent verification fails, they remain
      // available for manual recovery.
      await this.prisma.witmangoWalletLink.update({
        where: { walletId },
        data: {
          clientId: created.clientId,
          savingsAccountId: created.savingsAccountId,
        },
      });

      const account =
        await this.witmango.getSavingsAccount(
          created.savingsAccountId,
        );

      if (
        account.status.id !== 300 ||
        account.summary.accountBalance !== 0 ||
        account.summary.availableBalance !== 0
      ) {
        throw new ConflictException(
          'New Witmango wallet requires reconciliation before activation',
        );
      }

      await this.prisma.witmangoWalletLink.update({
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
          clientId: created.clientId,
          savingsAccountId: created.savingsAccountId,
          tenantId,
        },
      });

      return {
        walletId,
        status: WitmangoWalletLinkStatus.ACTIVE,
        clientId: created.clientId,
        savingsAccountId: created.savingsAccountId,
      };
    } catch {
      // The upstream wallet MAY have been created.
      // Never automatically repeat POST /v1/clients.
      await this.prisma.witmangoWalletLink.update({
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

  async reconcile(walletId: string) {
    const link = await this.prisma.witmangoWalletLink.findUnique({
      where: { walletId },
    });

    if (!link) {
      throw new NotFoundException(
        'Witmango wallet mapping not found',
      );
    }

    if (
      link.tenantId !== this.tenantId() ||
      link.status !== WitmangoWalletLinkStatus.ACTIVE ||
      !link.savingsAccountId
    ) {
      throw new ConflictException(
        'Witmango wallet linkage is not ready for reconciliation',
      );
    }

    const internal =
      await this.wallets.getWallet(walletId);

    const external =
      await this.witmango.getSavingsAccount(
        link.savingsAccountId,
      );

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

    const externalAvailableKobo =
      this.toKobo(external.summary.availableBalance);

    const externalTotalKobo =
      this.toKobo(external.summary.accountBalance);

    const differences: string[] = [];

    if (internal.currency !== 'NGN') {
      differences.push('INTERNAL_CURRENCY');
    }

    if (internal.status !== WalletStatus.ACTIVE) {
      differences.push('INTERNAL_WALLET_STATUS');
    }

    if (external.status.id !== 300) {
      differences.push('EXTERNAL_ACCOUNT_STATUS');
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

    await this.prisma.witmangoWalletLink.update({
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
        availableNgn: external.summary.availableBalance,
        totalNgn: external.summary.accountBalance,
      },

      differences,
    };
  }
}
