
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  AgentStatus,
  KycStatus,
  LedgerOwnerType,
  WalletStatus,
  WitmangoWalletLinkStatus,
  WitmangoWalletPurpose,
  AuditActorType,
  Prisma
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

  function emptyAccount(id: number, balance = 0) {
    return {
      id,
      accountNo: `62002920${id}`,
      status: { id: 300 },
      currency: { code: 'NGN' },
      summary: {
        accountBalance: balance,
        availableBalance: balance,
      },
    };
  }

  function activeLinks() {
    return [
      {
        walletId,
        purpose: WitmangoWalletPurpose.DEPOSIT,
        tenantId: 'sandbox',
        clientId: 4,
        savingsAccountId: 10,
        status: WitmangoWalletLinkStatus.ACTIVE,
        lastReconciledAt: null,
      },
      {
        walletId,
        purpose: WitmangoWalletPurpose.WINNINGS,
        tenantId: 'sandbox',
        clientId: 4,
        savingsAccountId: 11,
        status: WitmangoWalletLinkStatus.ACTIVE,
        lastReconciledAt: null,
      },
    ];
  }

  function setup(configOverrides: Record<string, unknown> = {}) {
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
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          agentId: userId,
          email: 'agent@example.com',
          status: AgentStatus.ACTIVE,
          walletBalanceNgn: 0,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          email: input.email,
          kycStatus: KycStatus.TIER1_COMPLETE,
        }),
      },
      verifiedIdentity: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          firstName: 'Verified',
          lastName: 'Person',
          dateOfBirth: new Date('1993-04-27T00:00:00.000Z'),
        }),
      },
      witmangoWalletLink: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
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
      openSavingsAccount: jest.fn().mockResolvedValue({
        savingsAccountId: 11,
      }),
      getSavingsAccount: jest.fn(
        async (id: number) => emptyAccount(id),
      ),
    };

    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          WITMANGO_ENABLED: true,
          WITMANGO_PROVISIONING_ENABLED: true,
          WITMANGO_TENANT_ID: 'sandbox',
          WITMANGO_OFFICE_ID: 1,
          WITMANGO_LEGAL_FORM_ID: 1,
          WITMANGO_DEPOSIT_PRODUCT_ID: 2,
          WITMANGO_WINNINGS_PRODUCT_ID: 3,
          WITMANGO_FLOAT_PRODUCT_ID: 5,
          WITMANGO_EARNINGS_PRODUCT_ID: 6,
          ...configOverrides,
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

  describe('provisioning a customer', () => {
    it('opens a deposit and a winnings account and activates them together', async () => {
      const h = setup();

      const result = await h.service.provision(
        walletId,
        input,
        'finance-admin',
      );

      expect(result).toEqual({
        walletId,
        ownerType: LedgerOwnerType.CUSTOMER,
        status: WitmangoWalletLinkStatus.ACTIVE,
        clientId: 4,
        accounts: [
          { purpose: WitmangoWalletPurpose.DEPOSIT, savingsAccountId: 10 },
          { purpose: WitmangoWalletPurpose.WINNINGS, savingsAccountId: 11 },
        ],
      });

      expect(h.prisma.witmangoWalletLink.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            walletId,
            purpose: WitmangoWalletPurpose.DEPOSIT,
            clientExternalId: `sw-${walletId}`,
            savingsProductId: 2,
            status: WitmangoWalletLinkStatus.PROVISIONING,
          }),
          expect.objectContaining({
            walletId,
            purpose: WitmangoWalletPurpose.WINNINGS,
            clientExternalId: `sw-${walletId}`,
            accountExternalId: `sw-${walletId}-winnings`,
            savingsProductId: 3,
            status: WitmangoWalletLinkStatus.PROVISIONING,
          }),
        ],
      });

      expect(h.witmango.createClientWithWallet).toHaveBeenCalledWith(
        expect.objectContaining({ savingsProductId: 2 }),
      );

      expect(h.witmango.openSavingsAccount).toHaveBeenCalledWith({
        clientId: 4,
        savingsProductId: 3,
        externalId: `sw-${walletId}-winnings`,
      });

      expect(h.prisma.witmangoWalletLink.updateMany).toHaveBeenCalledWith({
        where: { walletId },
        data: { status: WitmangoWalletLinkStatus.ACTIVE },
      });
    });

    it('prevents duplicate provisioning', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findMany.mockResolvedValue([
        { purpose: WitmangoWalletPurpose.DEPOSIT },
      ]);

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ConflictException);

      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
      expect(h.witmango.createClientWithWallet).not.toHaveBeenCalled();
    });

    it('blocks provisioning a funded wallet', async () => {
      const h = setup();

      h.wallets.getWallet.mockResolvedValue({
        ...h.wallet,
        availableNgn: 5000,
        totalNgn: 5000,
      });

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ConflictException);

      expect(h.witmango.createClientWithWallet).not.toHaveBeenCalled();
    });

    it('fails on a missing product without reserving anything', async () => {
      const h = setup({ WITMANGO_WINNINGS_PRODUCT_ID: undefined });

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
      expect(h.witmango.createClientWithWallet).not.toHaveBeenCalled();
    });

    it('refuses to use one product for both accounts', async () => {
      const h = setup({ WITMANGO_WINNINGS_PRODUCT_ID: 2 });

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('sends both accounts to review when the client creation is uncertain', async () => {
      const h = setup();

      h.witmango.createClientWithWallet.mockRejectedValue(
        new Error('Connection timed out'),
      );

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(h.witmango.openSavingsAccount).not.toHaveBeenCalled();
      expect(h.prisma.witmangoWalletLink.updateMany).toHaveBeenCalledWith({
        where: { walletId },
        data: { status: WitmangoWalletLinkStatus.REVIEW_REQUIRED },
      });
    });

    it('keeps the deposit IDs and sends both to review when the second account fails', async () => {
      const h = setup();

      h.witmango.openSavingsAccount.mockRejectedValue(
        new Error('Connection timed out'),
      );

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);

      // The client and deposit account exist upstream, so their IDs must be
      // on record for whoever reconciles this by hand.
      expect(h.prisma.witmangoWalletLink.update).toHaveBeenCalledWith({
        where: {
          walletId_purpose: {
            walletId,
            purpose: WitmangoWalletPurpose.DEPOSIT,
          },
        },
        data: { clientId: 4, savingsAccountId: 10 },
      });

      expect(h.prisma.witmangoWalletLink.updateMany).toHaveBeenCalledWith({
        where: { walletId },
        data: { status: WitmangoWalletLinkStatus.REVIEW_REQUIRED },
      });

      expect(h.prisma.witmangoWalletLink.updateMany).not.toHaveBeenCalledWith({
        where: { walletId },
        data: { status: WitmangoWalletLinkStatus.ACTIVE },
      });
    });

    it('does not activate when a new account is not empty', async () => {
      const h = setup();

      h.witmango.getSavingsAccount.mockImplementation(
        async (id: number) => emptyAccount(id, id === 11 ? 100 : 0),
      );

      await expect(
        h.service.provision(walletId, input, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(h.prisma.witmangoWalletLink.updateMany).not.toHaveBeenCalledWith({
        where: { walletId },
        data: { status: WitmangoWalletLinkStatus.ACTIVE },
      });
    });
  });

  describe('provisioning an agent', () => {
    const agentInput = { ...input, email: 'agent@example.com' };

    function agentSetup(configOverrides: Record<string, unknown> = {}) {
      const h = setup(configOverrides);
      h.wallets.getWallet.mockResolvedValue({
        ...h.wallet,
        ownerType: LedgerOwnerType.AGENT,
      });
      return h;
    }

    it('opens a float and an earnings account on the agent products', async () => {
      const h = agentSetup();

      const result = await h.service.provision(walletId, agentInput, 'finance-admin');

      expect(result.ownerType).toBe(LedgerOwnerType.AGENT);
      expect(result.accounts).toEqual([
        { purpose: WitmangoWalletPurpose.FLOAT, savingsAccountId: 10 },
        { purpose: WitmangoWalletPurpose.EARNINGS, savingsAccountId: 11 },
      ]);

      expect(h.witmango.createClientWithWallet).toHaveBeenCalledWith(
        expect.objectContaining({ savingsProductId: 5 }),
      );
      expect(h.witmango.openSavingsAccount).toHaveBeenCalledWith({
        clientId: 4,
        savingsProductId: 6,
        externalId: `sw-${walletId}-earnings`,
      });

      // Agent eligibility, not customer KYC, decides an agent wallet.
      expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['still in onboarding', AgentStatus.PENDING_KYC],
      ['suspended', AgentStatus.SUSPENDED],
    ])('refuses an agent who is %s', async (_label, status) => {
      const h = agentSetup();
      h.prisma.agent.findUnique.mockResolvedValue({
        agentId: userId,
        email: 'agent@example.com',
        status,
        walletBalanceNgn: 0,
      });

      await expect(
        h.service.provision(walletId, agentInput, 'finance-admin'),
      ).rejects.toThrow(ConflictException);
      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('refuses an agent with money in the legacy balance column', async () => {
      const h = agentSetup();
      h.prisma.agent.findUnique.mockResolvedValue({
        agentId: userId,
        email: 'agent@example.com',
        status: AgentStatus.ACTIVE,
        walletBalanceNgn: 1200,
      });

      await expect(
        h.service.provision(walletId, agentInput, 'finance-admin'),
      ).rejects.toThrow(ConflictException);
      expect(h.witmango.createClientWithWallet).not.toHaveBeenCalled();
    });

    it('refuses an agent with no registered email', async () => {
      const h = agentSetup();
      h.prisma.agent.findUnique.mockResolvedValue({
        agentId: userId,
        email: null,
        status: AgentStatus.ACTIVE,
        walletBalanceNgn: 0,
      });

      await expect(
        h.service.provision(walletId, agentInput, 'finance-admin'),
      ).rejects.toThrow(ConflictException);
      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('refuses when the supplied email is not the agent\'s', async () => {
      const h = agentSetup();

      await expect(
        h.service.provision(
          walletId,
          { ...agentInput, email: 'someone-else@example.com' },
          'finance-admin',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to share one product between float and earnings', async () => {
      const h = agentSetup({ WITMANGO_EARNINGS_PRODUCT_ID: 5 });

      await expect(
        h.service.provision(walletId, agentInput, 'finance-admin'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('reconciles an agent against its float and earnings accounts', async () => {
      const h = agentSetup();
      h.prisma.witmangoWalletLink.findMany.mockResolvedValue(
        activeLinks().map((link, i) => ({
          ...link,
          purpose: i === 0
            ? WitmangoWalletPurpose.FLOAT
            : WitmangoWalletPurpose.EARNINGS,
        })),
      );

      const result = await h.service.reconcile(walletId);
      expect(result.status).toBe('MATCHED');
    });

    it('will not reconcile an agent wallet linked to customer accounts', async () => {
      const h = agentSetup();
      h.prisma.witmangoWalletLink.findMany.mockResolvedValue(activeLinks());

      await expect(h.service.reconcile(walletId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  it('refuses a system wallet outright', async () => {
    const h = setup();
    h.wallets.getWallet.mockResolvedValue({
      ...h.wallet,
      ownerType: LedgerOwnerType.SYSTEM,
    });

    await expect(
      h.service.provision(walletId, input, 'finance-admin'),
    ).rejects.toThrow(ConflictException);
    expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
  });

  describe('customer self-service provisioning', () => {
    it('uses the verified identity, not anything the caller supplies', async () => {
      const h = setup();

      const result = await h.service.provisionForVerifiedCustomer(walletId, userId);

      expect(result.status).toBe(WitmangoWalletLinkStatus.ACTIVE);
      expect(h.witmango.createClientWithWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Verified',
          lastName: 'Person',
          dateOfBirth: '1993-04-27',
          email: input.email,
        }),
      );
      expect(h.audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { type: AuditActorType.CUSTOMER, id: userId },
        }),
      );
    });

    it('opens the client without an email when the customer has none', async () => {
      const h = setup();
      h.prisma.user.findUnique.mockResolvedValue({
        userId,
        email: null,
        kycStatus: KycStatus.TIER1_COMPLETE,
      });

      await h.service.provisionForVerifiedCustomer(walletId, userId);

      expect(h.witmango.createClientWithWallet).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
    });

    it('refuses a wallet that belongs to someone else', async () => {
      const h = setup();

      await expect(
        h.service.provisionForVerifiedCustomer(walletId, 'another-user'),
      ).rejects.toThrow(ConflictException);
      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('refuses a customer whose identity is not verified', async () => {
      const h = setup();
      h.prisma.verifiedIdentity.findUnique.mockResolvedValue(null);

      await expect(
        h.service.provisionForVerifiedCustomer(walletId, userId),
      ).rejects.toThrow(ConflictException);
      expect(h.prisma.witmangoWalletLink.createMany).not.toHaveBeenCalled();
    });

    it('refuses an agent wallet', async () => {
      const h = setup();
      h.wallets.getWallet.mockResolvedValue({
        ...h.wallet,
        ownerType: LedgerOwnerType.AGENT,
      });

      await expect(
        h.service.provisionForVerifiedCustomer(walletId, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('lets only one of two simultaneous requests through', async () => {
      const h = setup();
      h.prisma.witmangoWalletLink.createMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        h.service.provisionForVerifiedCustomer(walletId, userId),
      ).rejects.toThrow(ConflictException);
      expect(h.witmango.createClientWithWallet).not.toHaveBeenCalled();
    });
  });

  describe('wallet state', () => {
    it('is NONE with no accounts on record', async () => {
      const h = setup();
      await expect(h.service.getState(walletId)).resolves.toBe('NONE');
    });

    it('is READY only when both accounts are active', async () => {
      const h = setup();
      h.prisma.witmangoWalletLink.findMany.mockResolvedValue(activeLinks());
      await expect(h.service.getState(walletId)).resolves.toBe('READY');
    });

    it('is not READY for half a pair', async () => {
      const h = setup();
      h.prisma.witmangoWalletLink.findMany.mockResolvedValue([activeLinks()[0]]);
      await expect(h.service.getState(walletId)).resolves.toBe('IN_PROGRESS');
    });

    it('is UNDER_REVIEW when either account needs review', async () => {
      const h = setup();
      h.prisma.witmangoWalletLink.findMany.mockResolvedValue([
        activeLinks()[0],
        { ...activeLinks()[1], status: WitmangoWalletLinkStatus.REVIEW_REQUIRED },
      ]);
      await expect(h.service.getState(walletId)).resolves.toBe('UNDER_REVIEW');
    });
  });

  describe('reaching an account by purpose', () => {
    it('returns an active account', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findUnique.mockResolvedValue(
        activeLinks()[1],
      );

      await expect(
        h.service.getActiveAccount(walletId, WitmangoWalletPurpose.WINNINGS),
      ).resolves.toEqual({ clientId: 4, savingsAccountId: 11 });

      expect(h.prisma.witmangoWalletLink.findUnique).toHaveBeenCalledWith({
        where: {
          walletId_purpose: {
            walletId,
            purpose: WitmangoWalletPurpose.WINNINGS,
          },
        },
      });
    });

    it('refuses an account still being provisioned', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findUnique.mockResolvedValue({
        ...activeLinks()[1],
        status: WitmangoWalletLinkStatus.PROVISIONING,
      });

      await expect(
        h.service.getActiveAccount(walletId, WitmangoWalletPurpose.WINNINGS),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reconciling', () => {
    it('matches SureWina against the sum of both CBA accounts', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findMany.mockResolvedValue(activeLinks());
      h.wallets.getWallet.mockResolvedValue({
        ...h.wallet,
        availableNgn: 7500,
        totalNgn: 7500,
      });
      h.witmango.getSavingsAccount.mockImplementation(
        async (id: number) => emptyAccount(id, id === 10 ? 5000 : 2500),
      );

      const result = await h.service.reconcile(walletId);

      expect(result.status).toBe('MATCHED');
      expect(result.differences).toEqual([]);
      expect(result.external.totalNgn).toBe(7500);
      expect(h.prisma.witmangoWalletLink.updateMany).toHaveBeenCalledWith({
        where: { walletId },
        data: { lastReconciledAt: expect.any(Date) },
      });
    });

    it('detects mismatched external balances', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findMany.mockResolvedValue(activeLinks());
      h.witmango.getSavingsAccount.mockImplementation(
        async (id: number) => emptyAccount(id, 2500),
      );

      const result = await h.service.reconcile(walletId);

      expect(result.status).toBe('MISMATCH');
      expect(result.differences).toContain('AVAILABLE_BALANCE');
      expect(result.differences).toContain('TOTAL_BALANCE');
    });

    it('refuses when one of the two accounts is missing', async () => {
      const h = setup();

      h.prisma.witmangoWalletLink.findMany.mockResolvedValue([
        activeLinks()[0],
      ]);

      await expect(h.service.reconcile(walletId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('reports a wallet with no mapping', async () => {
      const h = setup();

      await expect(h.service.reconcile(walletId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});