import { BadRequestException } from '@nestjs/common';

import { ClaimsService } from '../src/claims/claims.service';
import { ClaimDefaultsService } from '../src/claims/claim-defaults.service';
import { ClaimsSweepService } from '../../worker/src/claims-sweep.service';

type AnyRecord = Record<string, any>;

function claimsServiceWith(prisma: AnyRecord) {
  const audit = { write: jest.fn(async () => undefined) };
  const settings = { getNumber: jest.fn(async () => 0), get: jest.fn(async () => null) };
  const service = Object.create(ClaimsService.prototype) as ClaimsService;
  Object.assign(service, { prisma, audit, settings });
  return { service, audit };
}

describe('Prizes: item only where the jackpot category is an item', () => {
  const tiers: Record<string, AnyRecord> = {
    'd-daily:1': { itemPrize: false },
    'd-jackpot:1': { itemPrize: true },
    'd-jackpot:2': { itemPrize: false },
  };
  const winners: Record<string, AnyRecord> = {
    'w-daily': { drawId: 'd-daily', tierNo: 1 },
    'w-jp-item': { drawId: 'd-jackpot', tierNo: 1 },
    'w-jp-cash': { drawId: 'd-jackpot', tierNo: 2 },
    'w-single': { drawId: 'd-single', tierNo: 1 },
  };
  const prisma = {
    drawWinner: { findUnique: jest.fn(async ({ where }: AnyRecord) => winners[where.winnerId] ?? null) },
    drawPrizeTier: { findUnique: jest.fn(async ({ where }: AnyRecord) => tiers[`${where.drawId_tierNo.drawId}:${where.drawId_tierNo.tierNo}`] ?? null) },
    draw: { findUnique: jest.fn(async () => ({ prizeModel: 'SINGLE' })) },
  };
  const { service } = claimsServiceWith(prisma);
  const allowed = (drawWinnerId: string | null) => service.itemAllowed({ drawWinnerId, drawResultId: 'r' });

  it('a daily category is cash only', async () => expect(await allowed('w-daily')).toBe(false));
  it('a jackpot item category offers the item', async () => expect(await allowed('w-jp-item')).toBe(true));
  it('a jackpot cash category is cash only', async () => expect(await allowed('w-jp-cash')).toBe(false));
  it('old single-prize draws keep their choice', async () => {
    expect(await allowed('w-single')).toBe(true);
    expect(await allowed(null)).toBe(true);
  });

  it('choosing the item on a cash-only prize is refused', async () => {
    const claim = { claimId: 'c1', status: 'NOTIFIED', selectionDeadlineAt: new Date(Date.now() + 86_400_000), drawWinnerId: 'w-daily', drawResultId: 'r', grossPrizeValueNgn: 10000 };
    const s = claimsServiceWith(prisma).service as unknown as AnyRecord;
    s.findOwned = jest.fn(async () => claim);
    await expect((s as unknown as ClaimsService).choose('c1', '+2348000000001', 'PRODUCT' as never)).rejects.toThrow(BadRequestException);
  });
});

describe('Prizes: a winner who does not choose gets cash', () => {
  it('moves the claim to cash, with WHT worked out, and audits it', async () => {
    const updates: AnyRecord[] = [];
    const prisma = {
      prizeClaim: {
        findUnique: jest.fn(async () => ({ claimId: 'c1', status: 'NOTIFIED', grossPrizeValueNgn: 50000, winnerTicketRef: 'SW-1' })),
        updateMany: jest.fn(async (args: AnyRecord) => { updates.push(args); return { count: 1 }; }),
      },
    };
    const { service, audit } = claimsServiceWith(prisma);
    (service as unknown as AnyRecord).computeWht = jest.fn(async () => ({ whtRateBp: 500, whtAmountNgn: 2500, netPrizeValueNgn: 47500 }));
    expect(await service.defaultToCash('c1')).toBe(true);
    expect(updates[0]).toMatchObject({
      where: { claimId: 'c1', status: 'NOTIFIED' },
      data: { claimType: 'CASH', status: 'SELECTION_MADE', netPrizeValueNgn: 47500 },
    });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLAIM_DEFAULTED_TO_CASH' }));
  });

  it('the worker no longer forfeits for not choosing, only at the claim deadline', async () => {
    const findMany = jest.fn(async (_args: AnyRecord) => []);
    const sweep = new ClaimsSweepService({ prizeClaim: { findMany } } as never, {} as never, { get: () => undefined } as never);
    await (sweep as unknown as { tick(): Promise<void> }).tick();
    const where = (findMany.mock.calls[0] as unknown as [AnyRecord])[0].where;
    expect(JSON.stringify(where)).not.toContain('selectionDeadlineAt');
    expect(where.OR[0]).toMatchObject({ status: { in: ['NOTIFIED', 'SELECTION_MADE', 'KYC_PENDING'] }, claimDeadlineAt: expect.any(Object) });
  });
});

describe('Prizes: automatic wallet credit for direct customer winners', () => {
  function harness(opts: { channel?: string; buyer?: string | null; item?: boolean; walletState?: string; creditFails?: boolean; enabled?: boolean }) {
    const claim = { claimId: 'c1', winnerTicketRef: 'SW-1', winnerPhone: '+2348000000001', drawWinnerId: 'w1', drawResultId: 'r1', status: 'NOTIFIED' };
    const marks: AnyRecord[] = [];
    const prisma = {
      prizeClaim: {
        findMany: jest.fn(async ({ where }: AnyRecord) => (where.autoCreditAttemptedAt === null ? [claim] : [])),
        updateMany: jest.fn(async (args: AnyRecord) => { marks.push(args); return { count: 1 }; }),
      },
      ticket: { findFirst: jest.fn(async () => ({ purchaseChannel: opts.channel ?? 'DIRECT', buyerUserId: opts.buyer === undefined ? 'u1' : opts.buyer })) },
    };
    const audits: AnyRecord[] = [];
    const audit = { write: jest.fn(async (e: AnyRecord) => { audits.push(e); }) };
    const config = { get: jest.fn((k: string) => (k === 'PRIZE_AUTO_WALLET_CREDIT_ENABLED' ? opts.enabled ?? true : undefined)) };
    const claims = { itemAllowed: jest.fn(async () => !!opts.item), defaultToCash: jest.fn() };
    const walletCredit = {
      isEnabled: () => true,
      creditToWallet: jest.fn(async () => {
        if (opts.creditFails) throw new Error('CBA said no');
        return { creditedNgn: 47500, reference: 'TRF-1' };
      }),
    };
    const wallets = { getCustomerWallet: jest.fn(async () => ({ walletId: 'wal-1' })) };
    const cbaLinks = { getState: jest.fn(async () => opts.walletState ?? 'READY') };
    const service = new ClaimDefaultsService(prisma as never, audit as never, config as never, claims as never, walletCredit as never, wallets as never, cbaLinks as never);
    return { service, walletCredit, marks, audits };
  }

  it('pays a direct customer winner straight into their wallet', async () => {
    const h = harness({});
    await h.service.tick();
    expect(h.walletCredit.creditToWallet).toHaveBeenCalledWith('c1', { sub: 'u1', phoneNumber: '+2348000000001' });
    expect(h.marks).toHaveLength(1);
    expect(h.audits.map((a) => a.action)).toContain('PRIZE_AUTO_CREDITED');
  });

  it('never pays agent-sold tickets this way (the agent pays and is reimbursed)', async () => {
    const h = harness({ channel: 'AGENT', buyer: null });
    await h.service.tick();
    expect(h.walletCredit.creditToWallet).not.toHaveBeenCalled();
  });

  it('leaves jackpot item prizes for the winner to choose', async () => {
    const h = harness({ item: true });
    await h.service.tick();
    expect(h.walletCredit.creditToWallet).not.toHaveBeenCalled();
  });

  it('waits, without using its one attempt, until the wallet is set up', async () => {
    const h = harness({ walletState: 'NOT_STARTED' });
    await h.service.tick();
    expect(h.walletCredit.creditToWallet).not.toHaveBeenCalled();
    expect(h.marks).toHaveLength(0);
  });

  it('tries once: a failure is recorded and not retried every minute', async () => {
    const h = harness({ creditFails: true });
    await h.service.tick();
    expect(h.marks).toHaveLength(1);
    expect(h.audits.map((a) => a.action)).toContain('PRIZE_AUTO_CREDIT_NOT_COMPLETED');
  });

  it('does nothing while the switch is off', async () => {
    const h = harness({ enabled: false });
    await h.service.tick();
    expect(h.walletCredit.creditToWallet).not.toHaveBeenCalled();
  });
});
