import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  IdentityVerificationStatus,
  KycStatus,
  Prisma,
} from '@prisma/client';

import { IdentityVerificationService } from '../src/identity/identity-verification.service';

describe('IdentityVerificationService', () => {
  const userId = '22222222-2222-4222-8222-222222222222';

  const input = {
    firstName: 'Olatunde',
    lastName: 'Ogunboyejo',
    dateOfBirth: '1993-04-27',
    bvn: '22222222226',
  };

  const fullMatch = {
    outcome: 'CHECKED' as const,
    name: 'FULL_MATCH' as const,
    dateOfBirth: 'FULL_MATCH' as const,
    mobileNo: 'FULL_MATCH' as const,
  };

  function setup(configOverrides: Record<string, unknown> = {}) {
    const verifiedRow = {
      identityId: 'identity-1',
      userId,
      documentType: 'BVN',
      identityFingerprint: 'set-on-create',
      firstName: 'Olatunde',
      lastName: 'Ogunboyejo',
      dateOfBirth: new Date('1993-04-27T00:00:00.000Z'),
      attemptId: 'attempt-1',
      verifiedAt: new Date('2026-11-10T09:00:00.000Z'),
    };

    const tx = {
      identityVerificationAttempt: { update: jest.fn().mockResolvedValue({}) },
      verifiedIdentity: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...verifiedRow,
          ...data,
        })),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          phoneNumber: '+2348142223149',
          selfExclusionUntil: null,
        }),
      },
      verifiedIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      identityVerificationAttempt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ attemptId: 'attempt-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(
        async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };

    const monnify = {
      matchBvnDetails: jest.fn().mockResolvedValue(fullMatch),
    };

    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          KYC_BANK_FINGERPRINT_KEY: 'k'.repeat(40),
          KYC_REQUIRE_BVN_PHONE_MATCH: false,
          KYC_MAX_FAILED_ATTEMPTS_PER_DAY: 3,
          ...configOverrides,
        };
        return values[key];
      }),
    };

    const audit = { write: jest.fn().mockResolvedValue({}) };

    const service = new IdentityVerificationService(
      prisma as never,
      monnify as never,
      config as never,
      audit as never,
    );

    return { service, prisma, tx, monnify, audit, verifiedRow };
  }

  it('verifies a matching customer and marks them identity-complete', async () => {
    const h = setup();

    const result = await h.service.verifyBvn(userId, input);

    expect(result).toEqual({
      documentType: 'BVN',
      firstName: 'Olatunde',
      lastName: 'Ogunboyejo',
      verifiedAt: '2026-11-10T09:00:00.000Z',
      alreadyVerified: false,
    });

    expect(h.monnify.matchBvnDetails).toHaveBeenCalledWith({
      bvn: '22222222226',
      name: 'Olatunde Ogunboyejo',
      dateOfBirth: '1993-04-27',
      mobileNo: '08142223149',
    });

    expect(h.tx.user.update).toHaveBeenCalledWith({
      where: { userId },
      data: { kycStatus: KycStatus.TIER1_COMPLETE },
    });
  });

  it('stores a fingerprint, never the BVN itself', async () => {
    const h = setup();

    await h.service.verifyBvn(userId, input);

    const stored = JSON.stringify([
      h.prisma.identityVerificationAttempt.create.mock.calls,
      h.tx.verifiedIdentity.create.mock.calls,
      h.audit.write.mock.calls,
    ]);

    expect(stored).not.toContain(input.bvn);

    const { identityFingerprint } =
      h.tx.verifiedIdentity.create.mock.calls[0][0].data;
    expect(identityFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the existing record for the same BVN without paying again', async () => {
    const h = setup();

    await h.service.verifyBvn(userId, input);
    const { identityFingerprint } =
      h.tx.verifiedIdentity.create.mock.calls[0][0].data;

    h.monnify.matchBvnDetails.mockClear();
    h.prisma.verifiedIdentity.findUnique.mockResolvedValue({
      ...h.verifiedRow,
      identityFingerprint,
    });

    const again = await h.service.verifyBvn(userId, input);

    expect(again.alreadyVerified).toBe(true);
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it('refuses a different BVN once a customer is verified', async () => {
    const h = setup();
    h.prisma.verifiedIdentity.findUnique.mockResolvedValue({
      ...h.verifiedRow,
      identityFingerprint: 'f'.repeat(64),
    });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ConflictException,
    );
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it('refuses a self-excluded customer before any paid check', async () => {
    const h = setup();
    h.prisma.user.findUnique.mockResolvedValue({
      userId,
      phoneNumber: '+2348142223149',
      selfExclusionUntil: new Date(Date.now() + 86_400_000),
    });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ForbiddenException,
    );
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it('refuses someone under 18 before any paid check', async () => {
    const h = setup();
    const year = new Date().getUTCFullYear() - 17;

    await expect(
      h.service.verifyBvn(userId, { ...input, dateOfBirth: `${year}-01-01` }),
    ).rejects.toThrow(ForbiddenException);
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a BVN already verified on another account, at no cost', async () => {
    const h = setup();
    h.prisma.verifiedIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...h.verifiedRow, userId: 'someone-else' });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ConflictException,
    );
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
    expect(h.prisma.identityVerificationAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: IdentityVerificationStatus.FAILED,
        failureReason: 'BVN_IN_USE',
      }),
    });
  });

  it('stops after the daily limit of failed attempts', async () => {
    const h = setup();
    h.prisma.identityVerificationAttempt.count.mockResolvedValue(3);

    const error = await h.service.verifyBvn(userId, input).catch((e) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['a partial name match', { name: 'PARTIAL_MATCH' }, 'NAME_MISMATCH'],
    ['a wrong name', { name: 'NO_MATCH' }, 'NAME_MISMATCH'],
    ['a wrong date of birth', { dateOfBirth: 'NO_MATCH' }, 'DATE_OF_BIRTH_MISMATCH'],
  ])('rejects %s without saying which detail failed', async (_label, override, reason) => {
    const h = setup();
    h.monnify.matchBvnDetails.mockResolvedValue({ ...fullMatch, ...override });

    const error = await h.service.verifyBvn(userId, input).catch((e) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as Error).message).not.toMatch(/partial|percentage/i);
    expect(h.prisma.identityVerificationAttempt.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      data: expect.objectContaining({
        status: IdentityVerificationStatus.FAILED,
        failureReason: reason,
      }),
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gives the same message for a wrong name and a wrong date of birth', async () => {
    const messages: string[] = [];

    for (const override of [{ name: 'NO_MATCH' }, { dateOfBirth: 'NO_MATCH' }]) {
      const h = setup();
      h.monnify.matchBvnDetails.mockResolvedValue({ ...fullMatch, ...override });
      const error = await h.service.verifyBvn(userId, input).catch((e) => e);
      messages.push((error as Error).message);
    }

    expect(messages[0]).toBe(messages[1]);
  });

  it('accepts a phone mismatch by default, but records it', async () => {
    const h = setup();
    h.monnify.matchBvnDetails.mockResolvedValue({
      ...fullMatch,
      mobileNo: 'NO_MATCH',
    });

    await expect(h.service.verifyBvn(userId, input)).resolves.toMatchObject({
      alreadyVerified: false,
    });
    expect(h.tx.identityVerificationAttempt.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      data: expect.objectContaining({ phoneMatch: 'NO_MATCH' }),
    });
  });

  it('rejects a phone mismatch when the setting requires a match', async () => {
    const h = setup({ KYC_REQUIRE_BVN_PHONE_MATCH: true });
    h.monnify.matchBvnDetails.mockResolvedValue({
      ...fullMatch,
      mobileNo: 'NO_MATCH',
    });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('counts an unrecognised BVN as a failed attempt', async () => {
    const h = setup();
    h.monnify.matchBvnDetails.mockResolvedValue({ outcome: 'INVALID_BVN' });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      BadRequestException,
    );
    expect(h.prisma.identityVerificationAttempt.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      data: expect.objectContaining({
        status: IdentityVerificationStatus.FAILED,
        failureReason: 'INVALID_BVN',
      }),
    });
  });

  it('does not count a provider outage against the customer', async () => {
    const h = setup();
    h.monnify.matchBvnDetails.mockRejectedValue(new Error('unreachable'));

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(h.prisma.identityVerificationAttempt.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      data: expect.objectContaining({
        status: IdentityVerificationStatus.ERROR,
      }),
    });
  });

  it('catches two accounts verifying the same BVN at the same moment', async () => {
    const h = setup();
    h.prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
      }),
    );

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ConflictException,
    );
    expect(h.prisma.identityVerificationAttempt.update).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      data: expect.objectContaining({ failureReason: 'BVN_IN_USE' }),
    });
  });

  it('refuses to run without a fingerprint key', async () => {
    const h = setup({ KYC_BANK_FINGERPRINT_KEY: '' });

    await expect(h.service.verifyBvn(userId, input)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['a single-letter name', { firstName: 'A' }],
    ['a name with digits', { lastName: 'Smith2' }],
    ['a malformed BVN', { bvn: '1234' }],
    ['an impossible date', { dateOfBirth: '1993-02-31' }],
  ])('rejects %s before contacting anything', async (_label, override) => {
    const h = setup();

    await expect(
      h.service.verifyBvn(userId, { ...input, ...override }),
    ).rejects.toThrow(BadRequestException);
    expect(h.monnify.matchBvnDetails).not.toHaveBeenCalled();
  });

  it('reports status without exposing the fingerprint', async () => {
    const h = setup();
    h.prisma.verifiedIdentity.findUnique.mockResolvedValue(h.verifiedRow);

    const status = await h.service.getStatus(userId);

    expect(status).toEqual({
      verified: true,
      documentType: 'BVN',
      firstName: 'Olatunde',
      lastName: 'Ogunboyejo',
      verifiedAt: '2026-11-10T09:00:00.000Z',
    });
    expect(JSON.stringify(status)).not.toContain('identityFingerprint');
  });
});