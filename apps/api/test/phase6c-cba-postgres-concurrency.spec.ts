import { randomUUID } from 'node:crypto';
import {
  LedgerAccountPurpose,
  LedgerAccountType,
  LedgerOwnerType,
  LedgerTransactionKind,
  Prisma,
  PrismaClient,
  WalletHoldStatus,
  WalletWithdrawalStatus,
} from '@prisma/client';

/**
 * This is a REAL PostgreSQL concurrency test, not a mocked repository.
 *
 * It refuses to write to anything except a dedicated surewina_ci database
 * with an explicit CI or test opt-in. A developer's production/local
 * financial database must never receive test financial records.
 */
const database = process.env.DATABASE_URL;
let dbName: string | null = null;
try {
  dbName = database ? new URL(database).pathname.replace(/^\//, '') : null;
} catch {
  dbName = null;
}
const safeDatabase =
  dbName === 'surewina_ci' &&
  (process.env.CI === 'true' ||
   process.env.SUREWINA_FINANCIAL_DB_TESTS === '1');

const describeDatabase = safeDatabase ? describe : describe.skip;

describeDatabase('Phase 6C: PostgreSQL CBA withdrawal concurrency', () => {
  const prisma = new PrismaClient();
  const id = randomUUID();
  const userId = randomUUID();
  const walletId = randomUUID();
  const payoutAccountId = randomUUID();
  const accountAvailableId = randomUUID();
  const accountHeldId = randomUUID();
  const attemptIds = [randomUUID(), randomUUID()];
  const holdIds = [randomUUID(), randomUUID()];
  const holdLedgerIds = [randomUUID(), randomUUID()];

  beforeAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          userId,
          phoneNumber: '+2348' + id.replace(/-/g, '').slice(0, 10),
        },
      });
      await tx.ledgerAccount.createMany({
        data: [
          {
            accountId: accountAvailableId,
            code: 'TEST:' + id + ':AVAILABLE',
            name: 'CI available liability',
            accountType: LedgerAccountType.LIABILITY,
            purpose: LedgerAccountPurpose.CUSTOMER_AVAILABLE,
            ownerType: LedgerOwnerType.CUSTOMER,
            ownerId: userId,
          },
          {
            accountId: accountHeldId,
            code: 'TEST:' + id + ':HELD',
            name: 'CI held liability',
            accountType: LedgerAccountType.LIABILITY,
            purpose: LedgerAccountPurpose.CUSTOMER_HELD,
            ownerType: LedgerOwnerType.CUSTOMER,
            ownerId: userId,
          },
        ],
      });
      await tx.wallet.create({
        data: {
          walletId,
          userId,
          ownerType: LedgerOwnerType.CUSTOMER,
          availableAccountId: accountAvailableId,
          heldAccountId: accountHeldId,
        },
      });
      await tx.verifiedPayoutAccount.create({
        data: {
          payoutAccountId,
          userId,
          bankCode: '058',
          bankName: 'CI test bank',
          accountCiphertext: 'CI-ENCRYPTED-PLACEHOLDER-NEVER-USED',
          accountLast4: '6789',
          accountFingerprint: 'a'.repeat(64),
          resolvedAccountName: 'CI TEST CUSTOMER',
        },
      });
      await tx.ledgerTransaction.createMany({
        data: holdLedgerIds.map((ledgerTxnId, n) => ({
          ledgerTxnId,
          idempotencyKey: 'CI:hold-journal:' + id + ':' + n,
          kind: LedgerTransactionKind.WALLET_HOLD,
          referenceType: 'WalletWithdrawal',
          referenceId: attemptIds[n],
          description: 'CI fixture, removed after test',
          totalAmountNgn: 1000,
          entryCount: 2,
          fingerprint: 'b'.repeat(64),
          occurredAt: new Date(),
        })),
      });
      await tx.walletHold.createMany({
        data: holdIds.map((holdId, n) => ({
          holdId,
          walletId,
          idempotencyKey: 'CI:hold:' + id + ':' + n,
          referenceType: 'WalletWithdrawal',
          referenceId: attemptIds[n],
          amountNgn: 1000,
          status: WalletHoldStatus.HELD,
          holdLedgerTxnId: holdLedgerIds[n],
        })),
      });
    });
  });

  afterAll(async () => {
    try {
      // Delete in FK dependency order, even if an assertion failed.
      await prisma.walletWithdrawal.deleteMany({ where: { walletId } });
      await prisma.walletHold.deleteMany({ where: { walletId } });
      await prisma.ledgerTransaction.deleteMany({
        where: { ledgerTxnId: { in: holdLedgerIds } },
      });
      await prisma.verifiedPayoutAccount.deleteMany({ where: { userId } });
      await prisma.wallet.deleteMany({ where: { walletId } });
      await prisma.ledgerAccount.deleteMany({
        where: { accountId: { in: [accountAvailableId, accountHeldId] } },
      });
      await prisma.user.deleteMany({ where: { userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function withdrawal(n: number): Prisma.WalletWithdrawalCreateInput {
    return {
      withdrawalId: attemptIds[n],
      user: { connect: { userId } },
      wallet: { connect: { walletId } },
      payoutAccount: { connect: { payoutAccountId } },
      hold: { connect: { holdId: holdIds[n] } },
      requestId: attemptIds[n],
      tenantId: 'surewina-ci-only',
      savingsAccountId: 5550123,
      amountNgn: 1000,
      bankCode: '058',
      bankAccountLast4: '6789',
      bankFingerprint: 'a'.repeat(64),
      bankCiphertext: 'CI-ENCRYPTED-PLACEHOLDER-NEVER-USED',
      cbaReference: 'sw-cba-' + attemptIds[n],
      paystackReference: 'sw-bank-' + attemptIds[n],
    };
  }

  it('rejects one of two simultaneous unresolved withdrawals on the SAME wallet', async () => {
    const results = await Promise.allSettled([
      prisma.walletWithdrawal.create({ data: withdrawal(0) }),
      prisma.walletWithdrawal.create({ data: withdrawal(1) }),
    ]);

    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((x) => x.status === 'rejected');
    expect(failed?.status).toBe('rejected');
    if (failed?.status === 'rejected') {
      expect(failed.reason).toMatchObject({ code: 'P2002' });
    }

    const active = await prisma.walletWithdrawal.findMany({
      where: { walletId, status: WalletWithdrawalStatus.RESERVED },
    });
    expect(active).toHaveLength(1);

    // Resolve the first reservation atomically with its hold disposition.
    await prisma.$transaction(async (tx) => {
      await tx.walletHold.update({
        where: { holdId: active[0].holdId },
        data: { status: WalletHoldStatus.RELEASED },
      });
      await tx.walletWithdrawal.update({
        where: { withdrawalId: active[0].withdrawalId },
        data: {
          status: WalletWithdrawalStatus.CANCELLED,
          resolvedAt: new Date(),
        },
      });
    });

    // The same DB constraint now allows exactly one fresh unresolved record.
    const next = active[0].withdrawalId === attemptIds[0] ? 1 : 0;
    const second = await prisma.walletWithdrawal.create({
      data: withdrawal(next),
    });
    expect(second.status).toBe(WalletWithdrawalStatus.RESERVED);

    const outstanding = await prisma.walletWithdrawal.count({
      where: { walletId, status: WalletWithdrawalStatus.RESERVED },
    });
    expect(outstanding).toBe(1);

    // Nothing in this test calls Witmango, Paystack, payout finalization,
    // or ledger posting. The fixture is deleted after the assertions.
  });
});
