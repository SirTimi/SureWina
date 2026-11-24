import { readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';

// otplib is an ES module that Jest cannot load. This stand-in implements the
// same standard (RFC 6238 TOTP: SHA-1, 6 digits, 30-second steps) so the
// approval is tested against real codes.
jest.mock('otplib', () => {
  const { createHmac, randomBytes } = jest.requireActual('crypto');
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const toBase32 = (buf: Buffer) => {
    let bits = '';
    for (const b of buf) bits += b.toString(2).padStart(8, '0');
    return (bits.match(/.{1,5}/g) ?? []).map((c: string) => ALPHABET[parseInt(c.padEnd(5, '0'), 2)]).join('');
  };
  const fromBase32 = (s: string) => {
    const bits = [...s].map((c) => ALPHABET.indexOf(c).toString(2).padStart(5, '0')).join('');
    return Buffer.from((bits.match(/.{8}/g) ?? []).map((b: string) => parseInt(b, 2)));
  };
  const totp = (secret: string, step: number) => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const h = createHmac('sha1', fromBase32(secret)).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  };
  const now = () => Math.floor(Date.now() / 30_000);
  return {
    generateSecret: () => toBase32(randomBytes(20)),
    generate: async ({ secret }: { secret: string }) => totp(secret, now()),
    verify: async ({ secret, token }: { secret: string; token: string }) => ({
      valid: [-1, 0, 1].some((d) => totp(secret, now() + d) === token),
    }),
  };
});
import { generate, generateSecret } from 'otplib';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { drawSnapshotHash } from '../src/draws/draw-snapshot';
import { DrawReleaseService, buildChecks } from '../src/draws/draw-release.service';
import { ExecutionService } from '../../engine/src/execution.service';
import { LifecycleService } from '../../engine/src/lifecycle.service';

type AnyRecord = Record<string, any>;

const tiers = [
  { tierNo: 1, name: 'First', active: true, allocationBp: 5000, winnerCount: null, prizePerWinnerNgn: 1000, itemPrize: false },
  { tierNo: 2, name: 'Second', active: true, allocationBp: 5000, winnerCount: null, prizePerWinnerNgn: 100, itemPrize: false },
];

const baseDraw = () => ({
  drawId: 'd1', drawCode: 'RD-SW100-20261201-NOON', drawType: 'DAILY_STANDARD', status: 'SALES_CLOSED',
  ticketPriceNgn: 100, prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 10000, poolRevenueBasis: 'GROSS',
  prizeValueNgn: 10000, salesOpenAt: new Date('2026-11-30T18:00:00Z'), cutoffAt: new Date('2026-12-01T10:00:00Z'),
  scheduledAt: new Date('2026-12-01T11:00:00Z'), setupApprovedAt: new Date('2026-11-24T10:00:00Z'),
  prizeConfigLockedAt: new Date('2026-11-30T18:00:05Z'), configVersion: 1,
  seedCommit: { committedAt: new Date('2026-11-30T17:00:00Z') }, prizeTiers: tiers, release: null as AnyRecord | null,
});

const paidTicket = (ref: string, over: AnyRecord = {}) => ({
  ticketRef: ref, faceValueNgn: 100, createdAt: new Date('2026-12-01T08:00:00Z'), purchaseChannel: 'DIRECT', agentId: null,
  paymentTxnId: `p-${ref}`, walletPurchaseId: null, payment: { status: 'CONFIRMED' }, walletPurchase: null, ...over,
});

describe('Fingerprint', () => {
  it('the engine and the API use the same file', () => {
    const api = readFileSync(join(__dirname, '../src/draws/draw-snapshot.ts'), 'utf8');
    const engine = readFileSync(join(__dirname, '../../engine/src/draw-snapshot.ts'), 'utf8');
    expect(api).toBe(engine);
  });

  it('does not depend on order, but changes with any ticket or prize change', () => {
    const d = baseDraw();
    const base = { ...d, tiers, ticketRefs: ['A', 'B'], entryIds: [] } as never;
    const h = drawSnapshotHash(base);
    expect(drawSnapshotHash({ ...(base as AnyRecord), ticketRefs: ['B', 'A'] } as never)).toBe(h);
    expect(drawSnapshotHash({ ...(base as AnyRecord), ticketRefs: ['A', 'B', 'C'] } as never)).not.toBe(h);
    expect(drawSnapshotHash({ ...(base as AnyRecord), tiers: [{ ...tiers[0], prizePerWinnerNgn: 2000 }, tiers[1]] } as never)).not.toBe(h);
    expect(drawSnapshotHash({ ...(base as AnyRecord), poolMinimumNgn: 20000 } as never)).not.toBe(h);
  });
});

describe('Checks when sales close', () => {
  const run = (over: { draw?: AnyRecord; tickets?: AnyRecord[]; pending?: number } = {}) =>
    buildChecks({
      draw: { ...baseDraw(), ...(over.draw ?? {}) } as never,
      tickets: (over.tickets ?? [paidTicket('A'), paidTicket('B')]) as never,
      entries: 0,
      pendingWalletPurchases: over.pending ?? 0,
      salesNgn: 200,
    });
  const failed = (checks: AnyRecord[]) => checks.filter((c) => !c.ok && c.blocking).map((c) => c.code);

  it('a clean draw passes every blocking check', () => {
    expect(failed(run())).toEqual([]);
  });

  it('blocks a ticket sold after the cutoff', () => {
    expect(failed(run({ tickets: [paidTicket('A', { createdAt: new Date('2026-12-01T10:00:01Z') })] }))).toEqual(['NO_SALES_AFTER_CUTOFF']);
  });

  it('blocks a ticket without a confirmed payment', () => {
    expect(failed(run({ tickets: [paidTicket('A', { payment: { status: 'PENDING' } })] }))).toEqual(['EVERY_TICKET_PAID']);
    expect(failed(run({ tickets: [paidTicket('B', { paymentTxnId: null, payment: null, walletPurchaseId: 'w', walletPurchase: { status: 'REVIEW_REQUIRED' } })] }))).toEqual(['EVERY_TICKET_PAID']);
  });

  it('blocks a seed sealed after sales opened, or no seed', () => {
    expect(failed(run({ draw: { seedCommit: { committedAt: new Date('2026-11-30T19:00:00Z') } } }))).toEqual(['SEED_SEALED_BEFORE_SALES']);
    expect(failed(run({ draw: { seedCommit: null } }))).toEqual(['SEED_SEALED_BEFORE_SALES']);
  });

  it('blocks an unapproved setup, an agent ticket with no agent, an unlocked prize setup', () => {
    expect(failed(run({ draw: { setupApprovedAt: null } }))).toEqual(['SETUP_APPROVED']);
    expect(failed(run({ tickets: [paidTicket('A', { purchaseChannel: 'AGENT', agentId: null })] }))).toEqual(['AGENT_SALES_RECORDED']);
    expect(failed(run({ draw: { prizeConfigLockedAt: null } }))).toEqual(['PRIZE_SETUP_VALID_AND_LOCKED']);
  });

  it('warns (without blocking) about a top-up, pending purchases and an empty draw', () => {
    const checks = run({ tickets: [], pending: 2 });
    expect(failed(checks)).toEqual([]);
    expect(checks.filter((c) => !c.ok).map((c) => c.code).sort()).toEqual(['HAS_ENTRIES', 'NO_PENDING_PURCHASES', 'POOL_FUNDING']);
  });
});

describe('Approving a draw', () => {
  const mfaSecret = generateSecret();
  const passwordHash = bcrypt.hashSync('correct horse', 4);

  function harness(opts: { required?: boolean; tickets?: AnyRecord[]; mfaEnabled?: boolean } = {}) {
    let draw = baseDraw();
    let release: AnyRecord | null = null;
    let tickets = opts.tickets ?? [paidTicket('A'), paidTicket('B')];
    const audits: AnyRecord[] = [];
    const prisma = {
      draw: {
        findUnique: jest.fn(async () => ({ ...draw, release, product: { name: 'Sure 100', code: 'SW100' } })),
        findUniqueOrThrow: jest.fn(async () => draw),
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async ({ data }: AnyRecord) => { draw = { ...draw, ...data }; return { count: 1 }; }),
      },
      ticket: { findMany: jest.fn(async () => tickets) },
      jackpotEntry: { findMany: jest.fn(async () => []) },
      walletPurchase: { count: jest.fn(async () => 0) },
      drawRelease: {
        findUnique: jest.fn(async () => release),
        create: jest.fn(async ({ data }: AnyRecord) => { release = { checkRuns: 1, ...data }; return release; }),
        update: jest.fn(async ({ data }: AnyRecord) => { release = { ...release, ...data, checkRuns: (release!.checkRuns as number) + 1 }; return release; }),
        updateMany: jest.fn(async ({ where, data }: AnyRecord) => {
          if (!release || (where.status && typeof where.status === 'string' && release.status !== where.status)) return { count: 0 };
          release = { ...release, ...data };
          return { count: 1 };
        }),
      },
      adminUser: { findUnique: jest.fn(async () => ({ isActive: true, passwordHash, mfaEnabled: opts.mfaEnabled ?? true, mfaSecret })) },
      auditLog: { findFirst: jest.fn(async () => ({ actorId: 'creator' })) },
    };
    const config = { get: jest.fn((k: string) => (k === 'DRAW_RELEASE_APPROVAL_REQUIRED' ? opts.required ?? true : undefined)) };
    const audit = { write: jest.fn(async (e: AnyRecord) => { audits.push(e); }) };
    const service = new DrawReleaseService(prisma as never, audit as never, config as never);
    return { service, audits, release: () => release, addTicket: (t: AnyRecord) => { tickets = [...tickets, t]; } };
  }
  const boss = { sub: 'owner', role: 'OPERATOR' as never, tier: 'SUPER' as never };
  const code = async () => generate({ secret: mfaSecret });

  it('checks the draw at close and waits for approval', async () => {
    const h = harness();
    await h.service.runChecks('d1', null);
    expect(h.release()).toMatchObject({ status: 'AWAITING_APPROVAL', tickets: 2, salesNgn: 200 });
  });

  it('holds a draw whose checks fail; it cannot be approved', async () => {
    const h = harness({ tickets: [paidTicket('A', { payment: { status: 'PENDING' } })] });
    await h.service.runChecks('d1', null);
    expect(h.release()!.status).toBe('CHECKS_FAILED');
    await expect(h.service.approve('d1', boss, 'correct horse', await code())).rejects.toThrow(ConflictException);
    expect(h.audits.map((a) => a.action)).toContain('DRAW_RELEASE_CHECKS_FAILED');
  });

  it('approves with the right password and two-factor code, tied to the fingerprint', async () => {
    const h = harness();
    await h.service.runChecks('d1', null);
    await h.service.approve('d1', boss, 'correct horse', await code());
    expect(h.release()).toMatchObject({ status: 'APPROVED', approvedBy: 'owner' });
    expect(h.audits.at(-1)).toMatchObject({ action: 'DRAW_RELEASE_APPROVED', severity: 'CRITICAL' });
  });

  it('refuses a wrong password or code, and records the attempt', async () => {
    const h = harness();
    await h.service.runChecks('d1', null);
    await expect(h.service.approve('d1', boss, 'wrong', await code())).rejects.toThrow(UnauthorizedException);
    await expect(h.service.approve('d1', boss, 'correct horse', '000000')).rejects.toThrow(UnauthorizedException);
    expect(h.release()!.status).toBe('AWAITING_APPROVAL');
    expect(h.audits.filter((a) => a.action === 'DRAW_RELEASE_RECONFIRM_FAILED')).toHaveLength(2);
  });

  it('refuses an approver without two-factor sign-in, and anyone who is not an approver', async () => {
    const h = harness({ mfaEnabled: false });
    await h.service.runChecks('d1', null);
    await expect(h.service.approve('d1', boss, 'correct horse', '123456')).rejects.toThrow(ForbiddenException);
    await expect(h.service.approve('d1', { ...boss, tier: 'INTERMEDIATE' as never }, 'correct horse', await code())).rejects.toThrow(ForbiddenException);
  });

  it('if the draw changed since the check, it re-checks and asks for a fresh review', async () => {
    const h = harness();
    await h.service.runChecks('d1', null);
    const firstHash = h.release()!.snapshotHash;
    h.addTicket(paidTicket('C'));
    await expect(h.service.approve('d1', boss, 'correct horse', await code())).rejects.toThrow('changed since it was checked');
    expect(h.release()!.status).toBe('AWAITING_APPROVAL');
    expect(h.release()!.snapshotHash).not.toBe(firstHash);
  });

  it('rejecting needs a reason and holds the draw', async () => {
    const h = harness();
    await h.service.runChecks('d1', null);
    await expect(h.service.reject('d1', boss, 'no')).rejects.toThrow();
    await h.service.reject('d1', boss, 'Agent AG-12 sales look wrong; investigating');
    expect(h.release()).toMatchObject({ status: 'REJECTED', rejectionReason: 'Agent AG-12 sales look wrong; investigating' });
  });

  it('with approval switched off, a clean draw is approved automatically (a failing one never is)', async () => {
    const h = harness({ required: false });
    await h.service.runChecks('d1', null);
    expect(h.release()).toMatchObject({ status: 'APPROVED', approvedBy: 'system:approval-not-required' });
    const bad = harness({ required: false, tickets: [paidTicket('A', { payment: { status: 'FAILED' } })] });
    await bad.service.runChecks('d1', null);
    expect(bad.release()!.status).toBe('CHECKS_FAILED');
  });

  it('a hand-made draw setup is approved by a different admin than its creator', async () => {
    const h = harness();
    (h.service as unknown as AnyRecord).prisma.draw.findUnique = jest.fn(async () => ({ ...baseDraw(), status: 'SCHEDULED', setupApprovedAt: null }));
    await expect(h.service.approveSetup('d1', { ...boss, sub: 'creator' })).rejects.toThrow(ConflictException);
    await expect(h.service.approveSetup('d1', boss)).resolves.toMatchObject({ drawId: 'd1' });
  });
});

describe('Engine gates', () => {
  it('opens sales only for a draw whose setup is approved', async () => {
    const findMany = jest.fn(async (_a: AnyRecord) => []);
    const lifecycle = new LifecycleService({ draw: { findMany, updateMany: jest.fn() }, auditLog: { create: jest.fn() } } as never);
    await (lifecycle as unknown as { activateCommittedDraws(): Promise<void> }).activateCommittedDraws();
    expect((findMany.mock.calls[0] as unknown as [AnyRecord])[0].where.setupApprovedAt).toEqual({ not: null });
  });

  it('runs only approved draws', async () => {
    const findMany = jest.fn(async (_a: AnyRecord) => []);
    const engine = new ExecutionService({ draw: { findMany } } as never, {} as never, {} as never);
    await (engine as unknown as { tick(): Promise<void> }).tick();
    expect((findMany.mock.calls[0] as unknown as [AnyRecord])[0].where.release).toEqual({ status: 'APPROVED' });
  });

  it('refuses to run a draw that changed after approval, and sends it back', async () => {
    const draw = { ...baseDraw(), status: 'EXECUTING', seedCommit: { sealedSeed: 's', seedHash: 'h', committedAt: new Date() } };
    const releaseUpdates: AnyRecord[] = [];
    const drawUpdates: AnyRecord[] = [];
    const prisma = {
      draw: {
        updateMany: jest.fn(async (a: AnyRecord) => { drawUpdates.push(a); return { count: 1 }; }),
        findUniqueOrThrow: jest.fn(async () => draw),
      },
      ticket: { findMany: jest.fn(async () => [{ ticketId: 't1', ticketRef: 'A', stateOfPlayCode: 'LA', buyerPhone: '+234', faceValueNgn: 100, agentId: null }]) },
      drawRelease: {
        findUnique: jest.fn(async () => ({ status: 'APPROVED', snapshotHash: 'f'.repeat(64) })),
        updateMany: jest.fn((a: AnyRecord) => { releaseUpdates.push(a); return a; }),
      },
      drawResult: { create: jest.fn() },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    const keys = { unseal: jest.fn(), signPayload: jest.fn(() => 'sig') };
    const engine = new ExecutionService(prisma as never, keys as never, { enqueueWinnerSms: jest.fn() } as never);
    await (engine as unknown as { execute(id: string): Promise<void> }).execute('d1');

    expect(keys.unseal).not.toHaveBeenCalled();
    expect(prisma.drawResult.create).not.toHaveBeenCalled();
    expect(releaseUpdates[0]).toMatchObject({ data: { status: 'INVALIDATED' } });
    expect(drawUpdates.at(-1)).toMatchObject({ where: { status: 'EXECUTING' }, data: { status: 'SALES_CLOSED' } });
  });
});
