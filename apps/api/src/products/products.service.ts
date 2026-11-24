import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  DrawPrizeModel,
  DrawStatus,
  DrawType,
  PoolRevenueBasis,
  Prisma,
  Product,
} from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { TierInput, planPrizes, validatePrizeConfig } from '../draws/prize-pool.math';

// What a product sells for and pays. Changed only through propose/approve.
export type ProductTerms = {
  name: string;
  ticketLabel: string;
  ticketPriceNgn: number;
  prizeDescription: string;
  poolPayoutBp: number | null;
  poolMinimumNgn: number | null;
  poolRevenueBasis: PoolRevenueBasis | null;
  tiers: TierInput[];
};

export type CreateProductInput = ProductTerms & {
  code: string;
  kind: DrawType;
};

// Products: the daily games (prize pool, up to 4 categories) and the jackpot
// games (up to 3 stages). Every change is maker-checker: a new product, or a
// change to one, waits until a different, senior admin approves it.
//
// Approving a change also applies it to the product's draws that have not
// opened for sales yet. Draws already selling keep what buyers were shown.
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = true) {
    const rows = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { active: true, approvedAt: { not: null } },
      orderBy: [{ kind: 'asc' }, { ticketPriceNgn: 'asc' }, { code: 'asc' }],
    });
    return { products: rows.map(toView) };
  }

  async get(productId: string) {
    return toView(await this.find(productId));
  }

  // A new product starts unapproved and inactive: nothing is scheduled for
  // it until it is approved.
  async create(input: CreateProductInput, adminId: string) {
    const code = (input.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(code)) {
      throw new BadRequestException('Product code must be 2 to 12 capital letters or digits');
    }
    if (input.kind !== DrawType.DAILY_STANDARD && input.kind !== DrawType.SATURDAY_JACKPOT) {
      throw new BadRequestException('A product is either a daily product or a jackpot product');
    }
    const terms = checkTerms(input.kind, input);

    try {
      const created = await this.prisma.product.create({
        data: {
          code,
          kind: input.kind,
          active: false,
          ...termsData(input.kind, terms),
          createdByAdminId: adminId,
          pendingChange: { create: true } as Prisma.InputJsonValue,
          pendingProposedBy: adminId,
          pendingProposedAt: new Date(),
        },
      });

      await this.audit.write({
        severity: AuditSeverity.WARNING,
        actor: { type: AuditActorType.ADMIN, id: adminId },
        action: 'PRODUCT_PROPOSED',
        resource: { type: 'Product', id: created.productId },
        metadata: { code, kind: input.kind, terms: auditTerms(terms) },
      });

      return toView(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A product with code ${code} already exists`);
      }
      throw error;
    }
  }

  // Proposes new terms. The current terms stay in force until approval.
  async proposeChange(productId: string, input: ProductTerms, adminId: string) {
    const product = await this.find(productId);
    if (product.pendingChange) {
      throw new ConflictException('A change to this product is already awaiting approval. Approve or reject it first.');
    }
    const terms = checkTerms(product.kind, input);

    const updated = await this.prisma.product.updateMany({
      where: { productId, pendingChange: { equals: Prisma.AnyNull } },
      data: {
        pendingChange: terms as unknown as Prisma.InputJsonValue,
        pendingProposedBy: adminId,
        pendingProposedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('A change to this product is already awaiting approval');
    }

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'PRODUCT_CHANGE_PROPOSED',
      resource: { type: 'Product', id: productId },
      metadata: { code: product.code, before: auditTerms(currentTerms(product)), after: auditTerms(terms) },
    });

    return this.get(productId);
  }

  async approve(productId: string, adminId: string) {
    const product = await this.find(productId);
    const pending = product.pendingChange as Record<string, unknown> | null;
    if (!pending) throw new ConflictException('Nothing is awaiting approval for this product');
    if (product.pendingProposedBy === adminId) {
      throw new ConflictException('A product change must be approved by a different admin than the one who proposed it');
    }

    const isCreate = pending.create === true;
    const terms = isCreate ? currentTerms(product) : checkTerms(product.kind, pending as unknown as ProductTerms);
    const now = new Date();

    const { updatedDraws } = await this.prisma.$transaction(async (tx) => {
      // Guarded on the same pending proposal, so two approvals cannot both apply.
      const claimed = await tx.product.updateMany({
        where: { productId, pendingProposedAt: product.pendingProposedAt, pendingProposedBy: product.pendingProposedBy },
        data: {
          ...(isCreate ? { active: true } : termsData(product.kind, terms)),
          version: isCreate ? product.version : { increment: 1 },
          pendingChange: Prisma.DbNull,
          pendingProposedBy: null,
          pendingProposedAt: null,
          approvedByAdminId: adminId,
          approvedAt: now,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('This change was already approved or withdrawn');

      return { updatedDraws: isCreate ? 0 : await applyToUnopenedDraws(tx, product, terms) };
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: isCreate ? 'PRODUCT_APPROVED' : 'PRODUCT_CHANGE_APPROVED',
      resource: { type: 'Product', id: productId },
      metadata: {
        code: product.code,
        proposedBy: product.pendingProposedBy,
        terms: auditTerms(terms),
        updatedDraws,
      },
    });

    return { ...(await this.get(productId)), updatedDraws };
  }

  async reject(productId: string, note: string, adminId: string) {
    const product = await this.find(productId);
    const pending = product.pendingChange as Record<string, unknown> | null;
    if (!pending) throw new ConflictException('Nothing is awaiting approval for this product');

    await this.prisma.product.update({
      where: { productId },
      data: { pendingChange: Prisma.DbNull, pendingProposedBy: null, pendingProposedAt: null },
    });

    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: pending.create === true ? 'PRODUCT_REJECTED' : 'PRODUCT_CHANGE_REJECTED',
      resource: { type: 'Product', id: productId },
      metadata: { code: product.code, proposedBy: product.pendingProposedBy, note },
    });

    return this.get(productId);
  }

  // Switching a product off stops new draws being scheduled for it. Draws
  // already scheduled or selling are not touched.
  async setActive(productId: string, active: boolean, adminId: string) {
    const product = await this.find(productId);
    if (active && !product.approvedAt) {
      throw new ConflictException('A product must be approved before it can be switched on');
    }
    await this.prisma.product.update({ where: { productId }, data: { active } });
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
      resource: { type: 'Product', id: productId },
      metadata: { code: product.code },
    });
    return this.get(productId);
  }

  private async find(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { productId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}

// ─── helpers (exported for the scheduler's tests) ───────────────────

// Daily products are prize pools; jackpot products are stages.
export function prizeModelFor(kind: DrawType): DrawPrizeModel {
  return kind === DrawType.SATURDAY_JACKPOT ? DrawPrizeModel.STAGES : DrawPrizeModel.POOL;
}

// The headline prize a draw shows: the guaranteed minimum pool, or the
// total of the jackpot stages.
export function headlinePrizeNgn(kind: DrawType, terms: Pick<ProductTerms, 'poolPayoutBp' | 'poolMinimumNgn' | 'tiers'>): number {
  if (prizeModelFor(kind) === DrawPrizeModel.POOL) return terms.poolMinimumNgn ?? 0;
  return planPrizes({ model: 'STAGES', tiers: terms.tiers }, 0).totalPrizeNgn;
}

export function tiersOf(product: Pick<Product, 'prizeTiers'>): TierInput[] {
  return (product.prizeTiers as unknown as TierInput[]) ?? [];
}

function checkTerms(kind: DrawType, input: ProductTerms): ProductTerms {
  const errors: string[] = [];
  const name = (input.name ?? '').trim();
  const ticketLabel = (input.ticketLabel ?? '').trim();
  const prizeDescription = (input.prizeDescription ?? '').trim();

  if (name.length < 2 || name.length > 60) errors.push('Product name must be 2 to 60 characters');
  if (ticketLabel.length < 2 || ticketLabel.length > 40) errors.push('The name printed on the ticket must be 2 to 40 characters');
  if (prizeDescription.length < 3 || prizeDescription.length > 200) errors.push('The prize headline must be 3 to 200 characters');
  if (!Number.isSafeInteger(input.ticketPriceNgn) || input.ticketPriceNgn < 1) errors.push('Ticket price must be a whole naira amount of at least ₦1');

  const model = prizeModelFor(kind) as 'POOL' | 'STAGES';
  const tiers = (input.tiers ?? []).map((t) => ({
    tierNo: t.tierNo,
    name: (t.name ?? '').trim(),
    active: !!t.active,
    allocationBp: model === 'POOL' ? t.allocationBp ?? null : null,
    winnerCount: model === 'STAGES' ? t.winnerCount ?? null : null,
    prizePerWinnerNgn: t.prizePerWinnerNgn,
    prizeDescription: t.prizeDescription?.trim() || null,
    // Not stripped for daily products: validatePrizeConfig refuses it, so a
    // setup mistake is reported rather than silently changed.
    itemPrize: !!t.itemPrize,
  }));
  errors.push(...validatePrizeConfig({
    model,
    payoutBp: model === 'POOL' ? input.poolPayoutBp : null,
    minimumNgn: model === 'POOL' ? input.poolMinimumNgn : null,
    tiers,
  }));

  if (errors.length > 0) {
    throw new BadRequestException({ message: errors, error: 'Invalid product' });
  }

  return {
    name,
    ticketLabel,
    ticketPriceNgn: input.ticketPriceNgn,
    prizeDescription,
    poolPayoutBp: model === 'POOL' ? (input.poolPayoutBp as number) : null,
    poolMinimumNgn: model === 'POOL' ? (input.poolMinimumNgn as number) : null,
    poolRevenueBasis: model === 'POOL' ? input.poolRevenueBasis ?? PoolRevenueBasis.GROSS : null,
    tiers: tiers.sort((a, b) => a.tierNo - b.tierNo),
  };
}

function termsData(kind: DrawType, terms: ProductTerms) {
  return {
    name: terms.name,
    ticketLabel: terms.ticketLabel,
    ticketPriceNgn: terms.ticketPriceNgn,
    prizeDescription: terms.prizeDescription,
    prizeModel: prizeModelFor(kind),
    poolPayoutBp: terms.poolPayoutBp,
    poolMinimumNgn: terms.poolMinimumNgn,
    poolRevenueBasis: terms.poolRevenueBasis,
    prizeTiers: terms.tiers as unknown as Prisma.InputJsonValue,
  };
}

function currentTerms(p: Product): ProductTerms {
  return {
    name: p.name,
    ticketLabel: p.ticketLabel,
    ticketPriceNgn: p.ticketPriceNgn,
    prizeDescription: p.prizeDescription,
    poolPayoutBp: p.poolPayoutBp,
    poolMinimumNgn: p.poolMinimumNgn,
    poolRevenueBasis: p.poolRevenueBasis,
    tiers: tiersOf(p),
  };
}

function auditTerms(t: ProductTerms) {
  return {
    ticketPriceNgn: t.ticketPriceNgn,
    poolPayoutBp: t.poolPayoutBp,
    poolMinimumNgn: t.poolMinimumNgn,
    poolRevenueBasis: t.poolRevenueBasis,
    tiers: t.tiers,
  };
}

// The approved terms reach every draw of the product that has not opened
// for sales. Guarded per draw on status and lock, so a draw that opens at
// the same moment is left as it was.
async function applyToUnopenedDraws(tx: Prisma.TransactionClient, product: Product, terms: ProductTerms): Promise<number> {
  const draws = await tx.draw.findMany({
    where: { productId: product.productId, status: DrawStatus.SCHEDULED, prizeConfigLockedAt: null },
    select: { drawId: true },
  });

  let updated = 0;
  for (const { drawId } of draws) {
    const changed = await tx.draw.updateMany({
      where: { drawId, status: DrawStatus.SCHEDULED, prizeConfigLockedAt: null },
      data: {
        ticketPriceNgn: terms.ticketPriceNgn,
        prizeDescription: terms.prizeDescription,
        prizeValueNgn: headlinePrizeNgn(product.kind, terms),
        prizeModel: prizeModelFor(product.kind),
        poolPayoutBp: terms.poolPayoutBp,
        poolMinimumNgn: terms.poolMinimumNgn,
        poolRevenueBasis: terms.poolRevenueBasis,
        configVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) continue;
    await tx.drawPrizeTier.deleteMany({ where: { drawId } });
    await tx.drawPrizeTier.createMany({ data: terms.tiers.map((t) => ({ drawId, ...tierRow(t) })) });
    updated += 1;
  }
  return updated;
}

export function tierRow(t: TierInput) {
  return {
    tierNo: t.tierNo,
    name: t.name.trim(),
    active: t.active,
    allocationBp: t.allocationBp ?? null,
    winnerCount: t.winnerCount ?? null,
    prizePerWinnerNgn: t.prizePerWinnerNgn,
    prizeDescription: t.prizeDescription?.trim() || null,
    itemPrize: !!t.itemPrize,
  };
}

function toView(p: Product) {
  const pending = p.pendingChange as Record<string, unknown> | null;
  return {
    productId: p.productId,
    code: p.code,
    name: p.name,
    ticketLabel: p.ticketLabel,
    kind: p.kind,
    active: p.active,
    approved: !!p.approvedAt,
    ticketPriceNgn: p.ticketPriceNgn,
    prizeDescription: p.prizeDescription,
    prizeModel: p.prizeModel,
    poolPayoutBp: p.poolPayoutBp,
    poolMinimumNgn: p.poolMinimumNgn,
    poolRevenueBasis: p.poolRevenueBasis,
    tiers: tiersOf(p),
    version: p.version,
    pending: pending
      ? {
          isNewProduct: pending.create === true,
          change: pending.create === true ? null : (pending as unknown as ProductTerms),
          proposedBy: p.pendingProposedBy,
          proposedAt: p.pendingProposedAt?.toISOString() ?? null,
        }
      : null,
    approvedByAdminId: p.approvedByAdminId,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
