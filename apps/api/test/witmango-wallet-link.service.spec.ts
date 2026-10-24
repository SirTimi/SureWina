
import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  KycStatus,
  LedgerOwnerType,
  WalletStatus,
  WitmangoWalletLinkStatus,
} from '@prisma/client';

import { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';

describe('WitmangoWalletLinkService', () => {
  const walletId =
    '11111111-1111-4111-8111-111111111111';

  const userId =
    '22222222-2222-4222-8222-222222222222';

  const input = {
    firstName: 'Test',
    lastName: 'Customer',
    email: 'test@example.com',
    dateOfBirth: '2003-06-10',
    consent: true,
  };

  function setup() {
    const wallet = {
      walletId,
      ownerType: LedgerOwnerType.CUSTOMER,
      ownerId: userId,
      status: WalletStatus.ACTIVE,
      currency: 'NGN',
      availableNgn: 0,
      heldNgn: 0,
      totalNgn: 0,
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          email: input.email,
          kycStatus: KycStatus.TIER1_COMPLETE,
        }),
      },
      witmangoWalletLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const wallets = {
      getWallet: jest.fn().mockResolvedValue(wallet),
    };

    const witmango = {
      isEnabled: jest.fn().mockReturnValue(true),
      createClientWithWallet: jest.fn().mockResolvedValue({
        clientId: 4,
        savingsAccountId: 10,
      }),
      getSavingsAccount: jest.fn().mockResolvedValue({
        id: 10,
        accountNo: '6200292001',
        status: { id: 300 },
        currency: { code: 'NGN' },
        summary: {
          accountBalance: 0,
          availableBalance: 0,
        },
      }),
    };

    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          WITMANGO_ENABLED: true,
          WITMANGO_PROVISIONING_ENABLED: true,
          WITMANGO_TENANT_ID: 'sandbox',
          WITMANGO_OFFICE_ID: 1,
          WITMANGO_LEGAL_FORM_ID: 1,
          WITMANGO_SAVINGS_PRODUCT_ID: 2,
        };
        return values[key];
      }),
    };

    const audit = {
      write: jest.fn().mockResolvedValue({}),
    };

    const service = new WitmangoWalletLinkService(
      prisma as never,
      wallets as never,
      witmango as never,
      config as never,
      audit as never,
    );

    return {
      service,
      prisma,
      wallets,
      witmango,
      config,
      audit,
      wallet,
    };
  }

  it('creates and records one external customer wallet', async () => {
    const h = setup();

    const result = await h.service.provisionCustomer(
      walletId,
      input,
      'finance-admin',
    );

    expect(result.status).toBe(
      WitmangoWalletLinkStatus.ACTIVE,
    );

    expect(h.witmango.createClientWithWallet)
      .toHaveBeenCalledTimes(1);

    expect(h.prisma.witmangoWalletLink.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId,
          clientExternalId: `sw-${walletId}`,
          status: WitmangoWalletLinkStatus.PROVISIONING,
        }),
      });
  });

  it('prevents duplicate customer provisioning', async () => {
    const h = setup();

    h.prisma.witmangoWalletLink.findUnique
      .mockResolvedValue({
        walletId,
        status: WitmangoWalletLinkStatus.REVIEW_REQUIRED,
      });

    await expect(
      h.service.provisionCustomer(
        walletId,
        input,
        'finance-admin',
      ),
    ).rejects.toThrow(ConflictException);

    expect(h.witmango.createClientWithWallet)
      .not.toHaveBeenCalled();
  });

  it('blocks provisioning a funded wallet', async () => {
    const h = setup();

    h.wallets.getWallet.mockResolvedValue({
      ...h.wallet,
      availableNgn: 5000,
      totalNgn: 5000,
    });

    await expect(
      h.service.provisionCustomer(
        walletId,
        input,
        'finance-admin',
      ),
    ).rejects.toThrow(ConflictException);

    expect(h.witmango.createClientWithWallet)
      .not.toHaveBeenCalled();
  });

  it('marks uncertain provisioning for manual review', async () => {
    const h = setup();

    h.witmango.createClientWithWallet
      .mockRejectedValue(
        new Error('Connection timed out'),
      );

    await expect(
      h.service.provisionCustomer(
        walletId,
        input,
        'finance-admin',
      ),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(h.prisma.witmangoWalletLink.update)
      .toHaveBeenCalledWith({
        where: { walletId },
        data: {
          status: WitmangoWalletLinkStatus.REVIEW_REQUIRED,
        },
      });
  });

  it('reports matching balances without posting money', async () => {
    const h = setup();

    h.prisma.witmangoWalletLink.findUnique
      .mockResolvedValue({
        walletId,
        tenantId: 'sandbox',
        savingsAccountId: 10,
        status: WitmangoWalletLinkStatus.ACTIVE,
      });

    const result = await h.service.reconcile(walletId);

    expect(result.status).toBe('MATCHED');
    expect(result.differences).toEqual([]);

    expect(h.prisma.witmangoWalletLink.update)
      .toHaveBeenCalledWith({
        where: { walletId },
        data: {
          lastReconciledAt: expect.any(Date),
        },
      });
  });

  it('detects mismatched external balances', async () => {
    const h = setup();

    h.prisma.witmangoWalletLink.findUnique
      .mockResolvedValue({
        walletId,
        tenantId: 'sandbox',
        savingsAccountId: 10,
        status: WitmangoWalletLinkStatus.ACTIVE,
      });

    h.witmango.getSavingsAccount.mockResolvedValue({
      id: 10,
      accountNo: '6200292001',
      status: { id: 300 },
      currency: { code: 'NGN' },
      summary: {
        accountBalance: 2500,
        availableBalance: 2500,
      },
    });

    const result = await h.service.reconcile(walletId);

    expect(result.status).toBe('MISMATCH');
    expect(result.differences).toContain(
      'AVAILABLE_BALANCE',
    );
    expect(result.differences).toContain(
      'TOTAL_BALANCE',
    );
  });
});
