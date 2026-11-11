import { ConflictException } from '@nestjs/common';
import { Prisma, ReservedAccountStatus } from '@prisma/client';

import { FundingAccountService } from '../src/onboarding/funding-account.service';

describe('FundingAccountService', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const walletId = '11111111-1111-4111-8111-111111111111';
  const reference = `SW-WAL-${walletId}`;
  const bvn = '22222222226';

  const banks = [
    { bankCode: '50515', bankName: 'Moniepoint Microfinance Bank', accountNumber: '6254727989' },
  ];

  function row(overrides: Record<string, unknown> = {}) {
    return {
      walletId,
      accountReference: reference,
      reservationReference: null,
      customerName: 'Olatunde Ogunboyejo',
      limitProfileCode: 'CUSTLIMIT01',
      accounts: null,
      status: ReservedAccountStatus.PROVISIONING,
      ...overrides,
    };
  }

  function setup(configOverrides: Record<string, unknown> = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          email: null,
          phoneNumber: '+2348142223149',
        }),
      },
      walletReservedAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const monnify = {
      isEnabled: jest.fn().mockReturnValue(true),
      reserve: jest.fn().mockResolvedValue({
        outcome: 'RESERVED',
        reservationReference: 'NWA7DMJ0W2UDK1KN5SLF',
        accounts: banks,
      }),
      find: jest.fn(),
    };
    const identity = {
      requireVerifiedBvn: jest.fn().mockResolvedValue({
        firstName: 'Olatunde',
        lastName: 'Ogunboyejo',
      }),
    };
    const links = { getState: jest.fn().mockResolvedValue('READY') };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          MONNIFY_CUSTOMER_LIMIT_PROFILE_CODE: 'CUSTLIMIT01',
          ...configOverrides,
        };
        return values[key];
      }),
    };
    const audit = { write: jest.fn().mockResolvedValue({}) };

    const service = new FundingAccountService(
      prisma as never,
      monnify as never,
      identity as never,
      links as never,
      config as never,
      audit as never,
    );

    return { service, prisma, monnify, identity, links, audit };
  }

  const call = { userId, walletId, bvn };

  it('reserves an account and returns the number to transfer into', async () => {
    const h = setup();

    await expect(h.service.ensureForCustomer(call)).resolves.toEqual({
      status: 'READY',
      accounts: [
        {
          bankName: 'Moniepoint Microfinance Bank',
          accountNumber: '6254727989',
          accountName: 'Olatunde Ogunboyejo',
        },
      ],
    });

    expect(h.monnify.reserve).toHaveBeenCalledWith({
      accountReference: reference,
      accountName: 'Olatunde Ogunboyejo',
      customerName: 'Olatunde Ogunboyejo',
      customerEmail: '2348142223149@buyers.surewina.ng',
      bvn,
      limitProfileCode: 'CUSTLIMIT01',
    });

    expect(h.prisma.walletReservedAccount.update).toHaveBeenCalledWith({
      where: { walletId },
      data: {
        status: ReservedAccountStatus.ACTIVE,
        reservationReference: 'NWA7DMJ0W2UDK1KN5SLF',
        accounts: banks,
      },
    });
  });

  it('never writes the BVN to the database or the audit log', async () => {
    const h = setup();

    await h.service.ensureForCustomer(call);

    const written = JSON.stringify([
      h.prisma.walletReservedAccount.create.mock.calls,
      h.prisma.walletReservedAccount.update.mock.calls,
      h.audit.write.mock.calls,
    ]);
    expect(written).not.toContain(bvn);
  });

  it('uses the registered email when the customer has one', async () => {
    const h = setup();
    h.prisma.user.findUnique.mockResolvedValue({
      userId,
      email: 'tunde@example.com',
      phoneNumber: '+2348142223149',
    });

    await h.service.ensureForCustomer(call);

    expect(h.monnify.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ customerEmail: 'tunde@example.com' }),
    );
  });

  it('refuses until the wallet accounts are ready', async () => {
    const h = setup();
    h.links.getState.mockResolvedValue('IN_PROGRESS');

    await expect(h.service.ensureForCustomer(call)).rejects.toThrow(
      ConflictException,
    );
    expect(h.monnify.reserve).not.toHaveBeenCalled();
    expect(h.prisma.walletReservedAccount.create).not.toHaveBeenCalled();
  });

  it('refuses a BVN that is not the verified one', async () => {
    const h = setup();
    h.identity.requireVerifiedBvn.mockRejectedValue(
      new ConflictException('This BVN does not match the verified identity'),
    );

    await expect(h.service.ensureForCustomer(call)).rejects.toThrow(
      ConflictException,
    );
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });

  it('issues no account when no limit profile is configured', async () => {
    const h = setup({ MONNIFY_CUSTOMER_LIMIT_PROFILE_CODE: '' });

    await expect(h.service.ensureForCustomer(call)).resolves.toEqual({
      status: 'NOT_AVAILABLE',
      accounts: [],
    });
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });

  it('reports not available while funding accounts are switched off', async () => {
    const h = setup();
    h.monnify.isEnabled.mockReturnValue(false);

    await expect(h.service.ensureForCustomer(call)).resolves.toEqual({
      status: 'NOT_AVAILABLE',
      accounts: [],
    });
    expect(h.links.getState).not.toHaveBeenCalled();
  });

  it('returns the existing account without reserving again', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.findUnique.mockResolvedValue(
      row({ status: ReservedAccountStatus.ACTIVE, accounts: banks }),
    );

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('READY');
    expect(view.accounts[0].accountNumber).toBe('6254727989');
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });

  it('tries again after an earlier attempt failed', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.findUnique.mockResolvedValue(row());

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('READY');
    expect(h.prisma.walletReservedAccount.create).not.toHaveBeenCalled();
    expect(h.monnify.reserve).toHaveBeenCalledTimes(1);
  });

  it('recovers a reservation whose answer never arrived', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.findUnique.mockResolvedValue(row());
    h.monnify.reserve.mockResolvedValue({ outcome: 'DUPLICATE_REFERENCE' });
    h.monnify.find.mockResolvedValue({
      reservationReference: 'NWA7DMJ0W2UDK1KN5SLF',
      accounts: banks,
    });

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('READY');
    expect(h.monnify.find).toHaveBeenCalledWith(reference);
  });

  it('sends a contradiction to review instead of retrying forever', async () => {
    const h = setup();
    h.monnify.reserve.mockResolvedValue({ outcome: 'DUPLICATE_REFERENCE' });
    h.monnify.find.mockResolvedValue(null);

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('BEING_SET_UP');
    expect(h.prisma.walletReservedAccount.update).toHaveBeenCalledWith({
      where: { walletId },
      data: { status: ReservedAccountStatus.REVIEW_REQUIRED },
    });
  });

  it('leaves a failed attempt pending so the next request retries', async () => {
    const h = setup();
    h.monnify.reserve.mockRejectedValue(new Error('unreachable'));

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('BEING_SET_UP');
    expect(h.prisma.walletReservedAccount.update).not.toHaveBeenCalled();
  });

  it('does not retry an account that is under review', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.findUnique.mockResolvedValue(
      row({ status: ReservedAccountStatus.REVIEW_REQUIRED }),
    );

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('BEING_SET_UP');
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });

  it('survives two simultaneous first requests', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    h.prisma.walletReservedAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(row());

    const view = await h.service.ensureForCustomer(call);

    expect(view.status).toBe('READY');
  });

  describe('reading the view', () => {
    it('is NOT_STARTED with nothing on record', async () => {
      const h = setup();
      await expect(h.service.getView(walletId)).resolves.toEqual({
        status: 'NOT_STARTED',
        accounts: [],
      });
    });

    it('shows no account numbers until the account is active', async () => {
      const h = setup();
      h.prisma.walletReservedAccount.findUnique.mockResolvedValue(
        row({ accounts: banks }),
      );

      await expect(h.service.getView(walletId)).resolves.toEqual({
        status: 'BEING_SET_UP',
        accounts: [],
      });
    });

    it('drops malformed stored entries rather than showing them', async () => {
      const h = setup();
      h.prisma.walletReservedAccount.findUnique.mockResolvedValue(
        row({
          status: ReservedAccountStatus.ACTIVE,
          accounts: [banks[0], { bankName: 'Broken', accountNumber: '12' }, 'junk'],
        }),
      );

      const view = await h.service.getView(walletId);

      expect(view.accounts).toHaveLength(1);
      expect(view.accounts[0].accountNumber).toBe('6254727989');
    });
  });
});