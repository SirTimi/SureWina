import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  AdminTier,
  AuditActorType,
  AuditSeverity,
  ReconciliationIssueStatus,
  ReconciliationIssueType,
  TreasuryProvider,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { RolloutCheckModule } from '../rollout/rollout-check.module';

// Closes the false Monnify balance variances opened while Monnify was on
// sandbox (the sandbox wallet holds play money; the books are ₦0).
//
// Dry run by default. Refuses unless Monnify still points at sandbox, and
// only touches OPEN Monnify BALANCE_VARIANCE issues where the books were ₦0.
// Marks them IGNORED with the note and the named Super Admin, and writes one
// CRITICAL audit entry listing every issue closed.
//
//   pnpm --filter @surewina/api treasury:dismiss-sandbox-variance -- --admin <email> --note "<reason>" [--apply]

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const email = (arg('admin') ?? '').trim().toLowerCase();
  const note = (arg('note') ?? '').trim();

  const app = await NestFactory.createApplicationContext(RolloutCheckModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const config = app.get(ConfigService);

    const base = String(config.get<string>('MONNIFY_BASE_URL') ?? '').toLowerCase();
    if (!base.includes('sandbox')) {
      throw new Error('Refused: MONNIFY_BASE_URL is not sandbox. Live variances must be investigated one by one.');
    }
    if (!email) throw new Error('Give --admin <email> (an active Super Admin)');
    if (note.length < 10) throw new Error('Give --note "<reason>" (at least 10 characters)');

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive || admin.tier !== AdminTier.SUPER) {
      throw new Error(`Refused: ${email} is not an active Super Admin`);
    }

    const issues = await prisma.reconciliationIssue.findMany({
      where: {
        status: ReconciliationIssueStatus.OPEN,
        type: ReconciliationIssueType.BALANCE_VARIANCE,
        provider: TreasuryProvider.MONNIFY,
        expectedAmountMinor: BigInt(0),
      },
      select: { issueId: true, actualAmountMinor: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byAmount = new Map<string, number>();
    for (const i of issues) {
      const k = `₦${(Number(i.actualAmountMinor ?? 0) / 100).toLocaleString('en-NG')} (sandbox) vs ₦0 (books)`;
      byAmount.set(k, (byAmount.get(k) ?? 0) + 1);
    }

    process.stdout.write(`\nOpen Monnify balance variances with ₦0 on the books: ${issues.length}\n`);
    for (const [k, n] of byAmount) process.stdout.write(`  ${n} x ${k}\n`);
    if (issues.length > 0) {
      process.stdout.write(`  from ${issues[0].createdAt.toISOString()} to ${issues[issues.length - 1].createdAt.toISOString()}\n`);
    }

    if (!apply) {
      process.stdout.write('\nDry run: nothing changed. Add --apply to close them.\n\n');
      return;
    }
    if (issues.length === 0) {
      process.stdout.write('\nNothing to close.\n\n');
      return;
    }

    const ids = issues.map((i) => i.issueId);
    const now = new Date();
    const closed = await prisma.$transaction(async (tx) => {
      const r = await tx.reconciliationIssue.updateMany({
        where: { issueId: { in: ids }, status: ReconciliationIssueStatus.OPEN },
        data: {
          status: ReconciliationIssueStatus.IGNORED,
          resolvedByAdminId: admin.adminUserId,
          resolvedAt: now,
          resolutionNote: `Sandbox balance, not real money: ${note}`.slice(0, 2000),
        },
      });
      await tx.auditLog.create({
        data: {
          severity: AuditSeverity.CRITICAL,
          actorType: AuditActorType.ADMIN,
          actorId: admin.adminUserId,
          action: 'RECONCILIATION_SANDBOX_VARIANCES_DISMISSED',
          resourceType: 'ReconciliationIssue',
          resourceId: 'MONNIFY:BALANCE_VARIANCE',
          metadata: {
            count: r.count,
            note,
            monnifyBaseUrl: base,
            amounts: Object.fromEntries(byAmount),
            issueIds: ids,
            via: 'treasury:dismiss-sandbox-variance',
          },
        },
      });
      return r.count;
    });

    process.stdout.write(`\nClosed ${closed} issue(s) as IGNORED by ${email}. One CRITICAL audit entry written.\n\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
