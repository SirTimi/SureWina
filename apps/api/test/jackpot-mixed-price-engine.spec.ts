import {
  DrawStatus,
  DrawType,
  JackpotEntryStatus,
  TicketStatus,
} from '@prisma/client';
import { ExecutionService } from '../../engine/src/execution.service';
import {
  computeMerkleRoot,
  deterministicWinnerIndex,
  sha256Hex,
} from '../../engine/src/draw-math.utils';
import type { PrismaService as EnginePrismaService } from '../../engine/src/prisma.service';
import type { EngineKeysService } from '../../engine/src/engine-keys.service';
import type { WinnerQueueService } from '../../engine/src/winner-queue.service';

const seed = Buffer.from(
  '385079932291aae40ccb42186a2d5c9fc864306137b98bd746ee97f92fbb5df8',
  'hex',
);
const drawId = 'jackpot-mixed-price';
const drawCode = 'SW-JACKPOT-MIXED';
const phones = Array.from({ length: 10 }, (_, i) =>
  `+23480${String(i).padStart(8, '0')}`,
);
const tickets = Array.from({ length: 10 }, (_, index) => ({
  ticketId: `ticket-${index + 1}`,
  ticketRef: `SW-JACKPOT-TICKET-${String(index + 1).padStart(2, '0')}`,
  buyerPhone: phones[index],
  stateOfPlayCode: 'FCT',
  status: TicketStatus.ACTIVE,
}));

type RunOptions = {
  promoIndexes?: number[];
  legacyEntry?: boolean;
};

async function executeMixedJackpot({
  promoIndexes = [8, 9],
  legacyEntry = false,
}: RunOptions = {}) {
  const pricedTickets = tickets.map((ticket, index) => ({
    ...ticket,
    faceValueNgn: promoIndexes.includes(index) ? 500 : 5000,
    jackpotDiscountOfferId: promoIndexes.includes(index)
      ? `offer-${index}`
      : null,
  }));
  const draw = {
    drawId,
    drawCode,
    drawType: DrawType.SATURDAY_JACKPOT,
    status: DrawStatus.SALES_CLOSED,
    prizeValueNgn: 4000000,
    prizeDescription: 'Saturday jackpot',
    scheduledAt: new Date('2026-10-10T20:00:00.000Z'),
    seedCommit: {
      sealedSeed: 'test-sealed-seed',
      seedHash: sha256Hex(seed),
      committedAt: new Date('2026-10-10T18:00:00.000Z'),
    },
  };
  const resultCreate = jest.fn(async (_args: unknown) => ({}));
  const ticketUpdate = jest.fn(async (_args: unknown) => ({}));
  const legacyUpdate = jest.fn(async (_args: unknown) => ({}));
  const drawUpdate = jest.fn(async (_args: unknown) => ({}));

  const tx = {
    drawResult: { create: resultCreate },
    ticket: { update: ticketUpdate },
    jackpotEntry: { update: legacyUpdate },
    draw: { update: drawUpdate },
  };
  const prisma = {
    draw: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => draw),
    },
    ticket: {
      findMany: jest.fn(async () => pricedTickets),
    },
    jackpotEntry: {
      findMany: jest.fn(async () =>
        legacyEntry
          ? [{ entryId: 'legacy-entry-1', buyerPhone: '+2348099999999' }]
          : [],
      ),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (
      work: (prismaTx: typeof tx) => Promise<void>,
    ) => work(tx)),
  };
  const keys = {
    unseal: jest.fn(() => seed),
    signPayload: jest.fn(() => 'signed-engine-payload'),
  };
  const winnerQueue = {
    enqueueWinnerSms: jest.fn(async () => undefined),
  };

  const engine = new ExecutionService(
    prisma as unknown as EnginePrismaService,
    keys as unknown as EngineKeysService,
    winnerQueue as unknown as WinnerQueueService,
  );
  // Use the production execution algorithm. No alternate test-only pool
  // builder and no mocked RNG are permitted in this regression suite.
  await (engine as unknown as {
    execute: (id: string) => Promise<void>;
  }).execute(drawId);

  return {
    prisma,
    tx,
    pricedTickets,
    resultCreate,
    ticketUpdate,
    legacyUpdate,
    drawUpdate,
    winnerQueue,
  };
}

describe('Phase 12: mixed-price jackpot engine', () => {
  it('gives eight normal and two discounted tickets exactly ten unweighted pool positions', async () => {
    const h = await executeMixedJackpot();

    expect(h.pricedTickets.filter((ticket) => ticket.faceValueNgn === 5000))
      .toHaveLength(8);
    expect(h.pricedTickets.filter((ticket) => ticket.faceValueNgn === 500))
      .toHaveLength(2);

    expect(h.prisma.ticket.findMany).toHaveBeenCalledWith({
      where: { drawId, status: TicketStatus.ACTIVE },
      orderBy: { ticketRef: 'asc' },
      select: {
        ticketId: true,
        ticketRef: true,
        stateOfPlayCode: true,
        buyerPhone: true,
      },
    });
    expect(h.prisma.jackpotEntry.findMany).toHaveBeenCalledWith({
      where: { drawId, status: JackpotEntryStatus.ACTIVE },
      orderBy: { entryId: 'asc' },
      select: { entryId: true, buyerPhone: true },
    });
    expect(h.resultCreate).toHaveBeenCalledTimes(1);

    const data = h.resultCreate.mock.calls[0][0] as unknown as {
      data: {
        winnerTicketRef: string;
        totalTicketsSold: number;
        totalEligibleParticipants: number;
        merkleRoot: string;
      };
    };
    expect(data.data.totalTicketsSold).toBe(10);
    expect(data.data.totalEligibleParticipants).toBe(10);
    const index = deterministicWinnerIndex(seed, drawCode, 10);
    expect(data.data.winnerTicketRef).toBe(tickets[index].ticketRef);
    expect(data.data.merkleRoot).toBe(
      computeMerkleRoot(tickets.map((ticket) => ticket.ticketRef), drawCode),
    );

    expect(h.ticketUpdate).toHaveBeenCalledTimes(1);
    expect(h.ticketUpdate).toHaveBeenCalledWith({
      where: { ticketId: tickets[index].ticketId },
      data: { status: TicketStatus.WINNING, isWinner: true },
    });
    expect(h.legacyUpdate).not.toHaveBeenCalled();
    expect(h.drawUpdate).toHaveBeenCalledWith({
      where: { drawId },
      data: {
        status: DrawStatus.COMPLETED,
        executedAt: expect.any(Date),
      },
    });
    expect(h.winnerQueue.enqueueWinnerSms).toHaveBeenCalledTimes(1);
  });

  it('selects the same winner and Merkle root when only ticket prices and offer links change', async () => {
    const first = await executeMixedJackpot({ promoIndexes: [8, 9] });
    const second = await executeMixedJackpot({ promoIndexes: [0, 1] });

    const a = (first.resultCreate.mock.calls[0][0] as unknown as {
      data: { winnerTicketRef: string; merkleRoot: string };
    }).data;
    const b = (second.resultCreate.mock.calls[0][0] as unknown as {
      data: { winnerTicketRef: string; merkleRoot: string };
    }).data;
    expect(a.winnerTicketRef).toBe(b.winnerTicketRef);
    expect(a.merkleRoot).toBe(b.merkleRoot);
    expect(first.pricedTickets.map((ticket) => ticket.faceValueNgn))
      .not.toEqual(second.pricedTickets.map((ticket) => ticket.faceValueNgn));
  });

  it('keeps historical active jackpot entries as separate equally sized pool positions', async () => {
    const h = await executeMixedJackpot({ legacyEntry: true });
    const data = (h.resultCreate.mock.calls[0][0] as unknown as {
      data: { winnerTicketRef: string; totalTicketsSold: number; totalEligibleParticipants: number };
    }).data;
    expect(data.totalTicketsSold).toBe(10);
    expect(data.totalEligibleParticipants).toBe(11);
    const eligible = [...tickets.map((ticket) => ticket.ticketRef), 'ENTRY-legacy-entry-1'];
    expect(data.winnerTicketRef).toBe(
      eligible[deterministicWinnerIndex(seed, drawCode, 11)],
    );
    expect(h.ticketUpdate.mock.calls.length + h.legacyUpdate.mock.calls.length)
      .toBe(1);
  });

  it('the seeded uniform index can reach every ticket slot without seeing ticket prices', () => {
    const visited = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const sampleSeed = Buffer.alloc(32);
      sampleSeed.writeUInt32BE(i, 28);
      const position = deterministicWinnerIndex(sampleSeed, drawCode, 10);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(10);
      visited.add(position);
    }
    expect([...visited].sort((a, b) => a - b))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
