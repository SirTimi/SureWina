import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AgentStatus,
  CbaTransferPurpose,
  CbaTransferStatus,
  ClaimType,
  PrizeClaimStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { PrizeWalletCreditService } from '../src/claims/prize-wallet-credit.service';
import { AgentPrizesService } from '../src/agent-ops/agent-prizes.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { SettingsService } from '../src/config/settings.service';
import type { WalletService } from '../src/wallet/wallet.service';
import type { WhtDeductionService } from '../src/claims/wht-deduction.service';
import type { AgentAccountingService } from '../src/agent-ops/agent-accounting.service';
import type { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';
import type { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';

type Row = Record<string, any>;

const SALES = { officeId: 1, clientId: 90, accountId: 900 };
const WINNINGS = { clientId: 4, savingsAccountId: 11 };
const EARNINGS = { clientId: 7, savingsAccountId: 71 };

function fakeTransfers(outcomes: CbaTransferStatus[], spendingEnabled = true) {
  const rows: Row[] = [];
  const queue = [...outcomes];
  return {
    rows,
    service: {
      isSpendingEnabled: () => spendingEnabled,
      salesEndpoint: () => SALES,
      endpoint: (a: { clientId: number; savingsAccountId: number }) => ({
        officeId: 1,
        clientId: a.clientId,
        accountId: a.savingsAccountId,
      }),
      createInTransaction: jest.fn(async (_tx: unknown, draft: Row) => {
        const row = {
          transferId: `t-${rows.length + 1}`,
          reference: `sw-xfr-${rows.length + 1}-abcdefgh`,
          status: CbaTransferStatus.PENDING,
          failureReason: null,
          ...draft,
        };
        rows.push(row);
        return { ...row };
      }),
      execute: jest.fn(async (id: string) => {
        const row = rows.find((r) => r.transferId === id)!;
        row.status = queue.shift() ?? CbaTransferStatus.POSTED;
        if (row.status === CbaTransferStatus.FAILED) row.failureReason = 'CBA_REJECTED';
        return { ...row };
      }),
    },
  };
}

describe('Phase 8: cash prize credited to CBA Winnings', () => {
  function harness(options: {
    outcomes?: CbaTransferStatus[];
    claim?: Row;
    enabled?: boolean;
    cbaState?: string;
  } = {}) {
    const claim: Row = {
      claimId: 'claim-1',
      winnerPhone: '+2348000000001',
      winnerUserId: 'user-1',
      status: PrizeClaimStatus.NOTIFIED,
      selectionDeadlineAt: new Date(Date.now() + 86_400_000),
      grossPrizeValueNgn: 100_000,
      netPrizeValueNgn: 100_000,
      claimTypeSelectedAt: null,
      paidByAgentId: null,
      ...options.claim,
    };

    const prisma: Row = {
      prizeClaim: {
        findUnique: jest.fn(async () => ({ ...claim })),
        findUniqueOrThrow: jest.fn(async () => ({ ...claim })),
        update: jest.fn(async ({ data }: { data: Row }) => {
          Object.assign(claim, data);
          return { ...claim };
        }),
      },
      $queryRaw: jest.fn(async () => [{ claim_id: claim.claimId }]),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));

    const transfers = fakeTransfers(options.outcomes ?? []);
    const wht = { recordForClaim: jest.fn(async () => undefined) };
    const audit = { write: jest.fn(async () => undefined) };
    const values: Record<string, number> = { WHT_RATE_PERCENT: 5, WHT_THRESHOLD_NGN: 0 };

    const service = new PrizeWalletCreditService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { getNumber: async (key: string, d: number) => values[key] ?? d } as unknown as SettingsService,
      { get: (key: string) => (key === 'WITMANGO_PRIZE_CREDITS_ENABLED' ? options.enabled ?? true : undefined) } as unknown as ConfigService,
      { getCustomerWallet: async () => ({ walletId: 'wallet-1' }) } as unknown as WalletService,
      wht as unknown as WhtDeductionService,
      {
        getState: async () => options.cbaState ?? 'READY',
        getActiveAccount: async (_w: string, purpose: WitmangoWalletPurpose) => {
          expect(purpose).toBe(WitmangoWalletPurpose.WINNINGS);
          return WINNINGS;
        },
      } as unknown as WitmangoWalletLinkService,
      transfers.service as unknown as WitmangoTransferService,
    );

    return { service, claim, transfers, wht, audit };
  }

  const user = { sub: 'user-1', phoneNumber: '+2348000000001' };

  it('is off unless deliberately switched on', async () => {
    const h = harness({ enabled: false });
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.transfers.rows).toHaveLength(0);
  });

  it('credits the net prize, after WHT, from the sales account into Winnings', async () => {
    const h = harness();

    const result = await h.service.creditToWallet('claim-1', user);

    expect(result).toMatchObject({
      status: PrizeClaimStatus.CASH_PAID,
      grossPrizeValueNgn: 100_000,
      whtAmountNgn: 5_000,
      creditedNgn: 95_000,
    });
    expect(h.transfers.rows).toHaveLength(1);
    expect(h.transfers.rows[0]).toMatchObject({
      purpose: CbaTransferPurpose.PRIZE_CREDIT,
      from: SALES,
      to: { officeId: 1, clientId: 4, accountId: 11 },
      amountNgn: 95_000,
      prizeClaimId: 'claim-1',
    });
    expect(h.claim).toMatchObject({
      status: PrizeClaimStatus.CASH_PAID,
      claimType: ClaimType.CASH,
      whtApplicable: true,
      whtAmountNgn: 5_000,
      netPrizeValueNgn: 95_000,
      payoutProvider: 'CBA_WALLET',
      payoutReference: h.transfers.rows[0].reference,
    });
    expect(h.wht.recordForClaim).toHaveBeenCalledWith('claim-1');
  });

  it('takes the claim out of every other route before any money moves', async () => {
    const h = harness();
    h.transfers.service.execute.mockImplementationOnce(async (id: string) => {
      expect(h.claim.status).toBe(PrizeClaimStatus.WALLET_CREDIT_PENDING);
      const row = h.transfers.rows.find((r) => r.transferId === id)!;
      row.status = CbaTransferStatus.POSTED;
      return { ...row };
    });

    await h.service.creditToWallet('claim-1', user);
  });

  it("refuses someone else's claim", async () => {
    const h = harness({ claim: { winnerUserId: 'user-2' } });
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    PrizeClaimStatus.KYC_PENDING,
    PrizeClaimStatus.CASH_PAID,
    PrizeClaimStatus.WALLET_CREDIT_PENDING,
    PrizeClaimStatus.FORFEITED,
  ])('refuses a claim that is %s', async (status) => {
    const h = harness({ claim: { status } });
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(h.transfers.rows).toHaveLength(0);
  });

  it('refuses a claim an agent has already paid in cash', async () => {
    const h = harness({ claim: { paidByAgentId: 'agent-1' } });
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires a ready wallet', async () => {
    const h = harness({ cbaState: 'NONE' });
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toThrow(
      'Set up your wallet',
    );
  });

  it('returns the claim to the winner when the CBA refuses, so they can retry or choose bank', async () => {
    const h = harness({ outcomes: [CbaTransferStatus.FAILED] });

    await expect(h.service.creditToWallet('claim-1', user)).rejects.toThrow(
      'Nothing was lost',
    );
    expect(h.claim).toMatchObject({
      status: PrizeClaimStatus.SELECTION_MADE,
      payoutProvider: null,
      payoutReference: null,
    });
    expect(h.wht.recordForClaim).not.toHaveBeenCalled();
  });

  it('leaves an uncertain credit pending for review, never paid twice', async () => {
    const h = harness({ outcomes: [CbaTransferStatus.UNCERTAIN] });

    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.claim.status).toBe(PrizeClaimStatus.WALLET_CREDIT_PENDING);

    // A second attempt is refused: the claim is no longer choosable.
    await expect(h.service.creditToWallet('claim-1', user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(h.transfers.service.execute).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 8: agent-paid prize reimbursed to CBA Earnings', () => {
  function harness(options: { outcomes?: CbaTransferStatus[]; spendingEnabled?: boolean } = {}) {
    const claim: Row = {
      claimId: 'claim-9',
      winnerTicketRef: 'SW-TKT-9',
      status: PrizeClaimStatus.NOTIFIED,
      claimTypeSelectedAt: null,
      grossPrizeValueNgn: 20_000,
      whtAmountNgn: 0,
      netPrizeValueNgn: 20_000,
      prizeAccrualLedgerTxnId: null,
      agentPayoutLedgerTxnId: null,
    };

    const prisma: Row = {
      agent: {
        findUnique: async () => ({ agentId: 'agent-1', agentCode: 'AG001', status: AgentStatus.ACTIVE }),
      },
      prizeClaim: {
        findUnique: jest.fn(async () => ({ ...claim })),
        update: jest.fn(async ({ data }: { data: Row }) => Object.assign(claim, data)),
      },
      $queryRaw: jest.fn(async () => []),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));

    const transfers = fakeTransfers(options.outcomes ?? [], options.spendingEnabled ?? true);
    const accounting = { recordAgentPrizePayoutInTransaction: jest.fn() };
    const audit = { write: jest.fn(async () => undefined) };

    const service = new AgentPrizesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as ConfigService,
      { recordForClaim: jest.fn(async () => undefined) } as unknown as WhtDeductionService,
      { getNumber: async () => 50_000 } as unknown as SettingsService,
      accounting as unknown as AgentAccountingService,
      {
        ensureAgentWallet: async () => ({ walletId: 'agent-wallet-1' }),
        getWallet: async () => ({ availableNgn: 0 }),
      } as unknown as WalletService,
      {
        getState: async () => 'READY',
        getActiveAccount: async (_w: string, purpose: WitmangoWalletPurpose) => {
          expect(purpose).toBe(WitmangoWalletPurpose.EARNINGS);
          return EARNINGS;
        },
      } as unknown as WitmangoWalletLinkService,
      transfers.service as unknown as WitmangoTransferService,
    );

    // The ticket lookup reads draws and tickets; reuse the claim directly.
    jest
      .spyOn(service as any, 'resolve')
      .mockResolvedValue({ claim: { ...claim }, maxNgn: 50_000 });

    return { service, claim, transfers, accounting, audit };
  }

  it('repays the agent into Earnings from the sales account, not the ledger wallet', async () => {
    const h = harness();

    const result = await h.service.logPayment('agent-1', 'SW-TKT-9');

    expect(result).toMatchObject({
      paid: true,
      amountNgn: 20_000,
      walletCreditedNgn: 20_000,
      fundingSource: 'CBA',
      reimbursementStatus: CbaTransferStatus.POSTED,
    });
    expect(h.transfers.rows[0]).toMatchObject({
      purpose: CbaTransferPurpose.PRIZE_REIMBURSEMENT,
      from: SALES,
      to: { officeId: 1, clientId: 7, accountId: 71 },
      amountNgn: 20_000,
      prizeClaimId: 'claim-9',
      walletId: 'agent-wallet-1',
    });
    expect(h.accounting.recordAgentPrizePayoutInTransaction).not.toHaveBeenCalled();
    expect(h.claim).toMatchObject({
      status: PrizeClaimStatus.CASH_PAID,
      paidByAgentId: 'agent-1',
    });
  });

  it('keeps the prize paid when the reimbursement does not post — it is owed, not undone', async () => {
    const h = harness({ outcomes: [CbaTransferStatus.FAILED] });

    const result = await h.service.logPayment('agent-1', 'SW-TKT-9');

    expect(result).toMatchObject({
      paid: true,
      walletCreditedNgn: 0,
      reimbursementStatus: CbaTransferStatus.FAILED,
    });
    expect(h.claim.status).toBe(PrizeClaimStatus.CASH_PAID);
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT_PRIZE_REIMBURSEMENT_NOT_POSTED' }),
    );
  });

  it('keeps the ledger reimbursement when CBA spending is off', async () => {
    const h = harness({ spendingEnabled: false });

    const result = await h.service.logPayment('agent-1', 'SW-TKT-9');

    expect(result.fundingSource).toBe('LEDGER');
    expect(h.accounting.recordAgentPrizePayoutInTransaction).toHaveBeenCalledTimes(1);
    expect(h.transfers.rows).toHaveLength(0);
  });
});
