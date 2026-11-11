import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { WalletOnboardingService } from '../src/onboarding/wallet-onboarding.service';

describe('WalletOnboardingService', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const walletId = '11111111-1111-4111-8111-111111111111';

  const input = {
    firstName: 'Olatunde',
    lastName: 'Ogunboyejo',
    dateOfBirth: '1993-04-27',
    bvn: '22222222226',
    acceptTerms: true,
  };

  const verified = {
    documentType: 'BVN',
    firstName: 'Olatunde',
    lastName: 'Ogunboyejo',
    verifiedAt: '2026-11-10T09:00:00.000Z',
    alreadyVerified: false,
  };

  const fundingReady = {
    status: 'READY',
    accounts: [
      {
        bankName: 'Moniepoint Microfinance Bank',
        accountNumber: '6254727989',
        accountName: 'Olatunde Ogunboyejo',
      },
    ],
  };

  const noFunding = { status: 'NOT_STARTED', accounts: [] };

  function setup() {
    const identity = {
      verifyBvn: jest.fn().mockResolvedValue(verified),
      getStatus: jest.fn().mockResolvedValue({ verified: true, ...verified }),
    };
    const wallets = {
      getCustomerWallet: jest.fn().mockResolvedValue({ walletId }),
    };
    const links = {
      getState: jest.fn(),
      provisionForVerifiedCustomer: jest.fn().mockResolvedValue({}),
    };
    const funding = {
      ensureForCustomer: jest.fn().mockResolvedValue(fundingReady),
      getView: jest.fn().mockResolvedValue(fundingReady),
    };
    const service = new WalletOnboardingService(
      identity as never,
      wallets as never,
      links as never,
      funding as never,
    );
    return { service, identity, wallets, links, funding };
  }

  it('verifies identity, opens the wallet accounts, and reports ready', async () => {
    const h = setup();
    h.links.getState
      .mockResolvedValueOnce('NONE')
      .mockResolvedValueOnce('READY');

    await expect(h.service.onboard(userId, input)).resolves.toEqual({
      identity: { verified: true, firstName: 'Olatunde', lastName: 'Ogunboyejo' },
      wallet: { status: 'READY' },
      funding: fundingReady,
    });

    expect(h.links.provisionForVerifiedCustomer).toHaveBeenCalledWith(
      walletId,
      userId,
    );
    expect(h.funding.ensureForCustomer).toHaveBeenCalledWith({
      userId,
      walletId,
      bvn: input.bvn,
    });
  });

  it('never returns the BVN', async () => {
    const h = setup();
    h.links.getState.mockResolvedValue('READY');

    const result = await h.service.onboard(userId, input);

    expect(JSON.stringify(result)).not.toContain(input.bvn);
  });

  it('does nothing further when the wallet is already ready', async () => {
    const h = setup();
    h.links.getState.mockResolvedValue('READY');

    const result = await h.service.onboard(userId, input);

    expect(result.wallet.status).toBe('READY');
    expect(h.links.provisionForVerifiedCustomer).not.toHaveBeenCalled();
  });

  it.each(['IN_PROGRESS', 'UNDER_REVIEW'])(
    'does not open a second pair when accounts are %s',
    async (state) => {
      const h = setup();
      h.links.getState.mockResolvedValue(state);

      const result = await h.service.onboard(userId, input);

      expect(result.wallet.status).toBe('BEING_SET_UP');
      expect(h.links.provisionForVerifiedCustomer).not.toHaveBeenCalled();
      // No account number until the wallet accounts exist to receive money.
      expect(h.funding.ensureForCustomer).not.toHaveBeenCalled();
      expect(result.funding).toEqual(noFunding);
    },
  );

  it('stops at identity when the details do not match', async () => {
    const h = setup();
    h.identity.verifyBvn.mockRejectedValue(
      new UnprocessableEntityException('These details do not match'),
    );

    await expect(h.service.onboard(userId, input)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(h.wallets.getCustomerWallet).not.toHaveBeenCalled();
    expect(h.links.provisionForVerifiedCustomer).not.toHaveBeenCalled();
  });

  it('keeps the verified identity when account setup fails partway', async () => {
    const h = setup();
    h.links.getState
      .mockResolvedValueOnce('NONE')
      .mockResolvedValueOnce('UNDER_REVIEW');
    h.links.provisionForVerifiedCustomer.mockRejectedValue(
      new ServiceUnavailableException('requires reconciliation'),
    );

    await expect(h.service.onboard(userId, input)).resolves.toEqual({
      identity: { verified: true, firstName: 'Olatunde', lastName: 'Ogunboyejo' },
      wallet: { status: 'BEING_SET_UP' },
      funding: noFunding,
    });
    expect(h.funding.ensureForCustomer).not.toHaveBeenCalled();
  });

  it('says setup is not available when it could not even begin', async () => {
    const h = setup();
    h.links.getState.mockResolvedValue('NONE');
    h.links.provisionForVerifiedCustomer.mockRejectedValue(
      new ServiceUnavailableException('Witmango provisioning is disabled'),
    );

    const result = await h.service.onboard(userId, input);

    expect(result.identity.verified).toBe(true);
    expect(result.wallet.status).toBe('NOT_AVAILABLE');
  });

  it('refuses without accepted terms, before any paid check', async () => {
    const h = setup();

    await expect(
      h.service.onboard(userId, { ...input, acceptTerms: false }),
    ).rejects.toThrow(BadRequestException);
    expect(h.identity.verifyBvn).not.toHaveBeenCalled();
  });

  describe('status', () => {
    it('reports an unverified customer without creating anything', async () => {
      const h = setup();
      h.identity.getStatus.mockResolvedValue({ verified: false });

      await expect(h.service.getStatus(userId)).resolves.toEqual({
        identity: { verified: false },
        wallet: { status: 'NOT_STARTED' },
        funding: noFunding,
      });
      expect(h.wallets.getCustomerWallet).not.toHaveBeenCalled();
    });

    it('reports a verified customer whose wallet is ready', async () => {
      const h = setup();
      h.links.getState.mockResolvedValue('READY');

      await expect(h.service.getStatus(userId)).resolves.toEqual({
        identity: { verified: true, firstName: 'Olatunde', lastName: 'Ogunboyejo' },
        wallet: { status: 'READY' },
        funding: fundingReady,
      });
      // Looking at status must never reserve an account.
      expect(h.funding.ensureForCustomer).not.toHaveBeenCalled();
    });

    it('shows no funding account while the wallet is still being set up', async () => {
      const h = setup();
      h.links.getState.mockResolvedValue('UNDER_REVIEW');

      const status = await h.service.getStatus(userId);

      expect(status.funding).toEqual(noFunding);
      expect(h.funding.getView).not.toHaveBeenCalled();
    });
  });

  it('reports the wallet ready even if the funding account step throws', async () => {
    const h = setup();
    h.links.getState.mockResolvedValue('READY');
    h.funding.ensureForCustomer.mockRejectedValue(new Error('boom'));

    const result = await h.service.onboard(userId, input);

    expect(result.wallet.status).toBe('READY');
    expect(result.funding).toEqual({ status: 'NOT_AVAILABLE', accounts: [] });
  });
});