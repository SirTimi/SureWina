import { Injectable } from '@nestjs/common';
import {
  AdminRole,
  AdminTier,
  AgentStatus,
  ConfigVersionStatus,
  DisputeStatus,
  DrawReleaseStatus,
  DrawStatus,
  Prisma,
  PaymentStatus,
  PrizeClaimStatus,
  RemittanceStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type AdminNotification = {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  detail: string;
  count: number;
  href: string;
};

// Derived, not stored. Every item here is a live state — work that is still
// outstanding — so there's nothing to mark read: it clears when the work is
// done. A stored feed would go stale the moment someone dismissed an item
// whose underlying queue hadn't moved.
@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async forAdmin(role: AdminRole, tier: AdminTier) {
    const notifications: AdminNotification[] = [];

    const isOps = role === AdminRole.OPERATOR;
    const isCompliance = role === AdminRole.COMPLIANCE_OFFICER;
    const isFinance = role === AdminRole.FINANCE_OFFICER;

    // Config approvals go to whoever can actually approve them — that's a
    // clearance question, not a departmental one.
    if (tier === AdminTier.SUPER) {
      const pendingTemplates = await this.prisma.drawTemplate.count({
        where: { status: ConfigVersionStatus.PENDING_APPROVAL },
      });
      if (pendingTemplates > 0) {
        notifications.push({
          id: 'templates-pending',
          severity: 'WARNING',
          title: 'Draw config awaiting your approval',
          detail: 'A pricing or schedule change was proposed and needs a second admin.',
          count: pendingTemplates,
          href: '/products',
        });
      }

      // Products awaiting approval (new, or a change).
      const pendingProducts = await this.prisma.product.count({
        where: { pendingChange: { not: Prisma.AnyNull } },
      });
      if (pendingProducts > 0) {
        notifications.push({
          id: 'products-pending',
          severity: 'WARNING',
          title: 'Product awaiting your approval',
          detail: 'A new product, or a change to a price or prizes, needs a second admin.',
          count: pendingProducts,
          href: '/products',
        });
      }

      // Draw approvals. A closed draw waits for approval before it runs.
      const [awaiting, held, setups] = await Promise.all([
        this.prisma.draw.count({
          where: { status: DrawStatus.SALES_CLOSED, release: { status: DrawReleaseStatus.AWAITING_APPROVAL } },
        }),
        this.prisma.draw.count({
          where: {
            status: DrawStatus.SALES_CLOSED,
            release: { status: { in: [DrawReleaseStatus.CHECKS_FAILED, DrawReleaseStatus.REJECTED, DrawReleaseStatus.INVALIDATED] } },
          },
        }),
        this.prisma.draw.count({ where: { status: DrawStatus.SCHEDULED, setupApprovedAt: null } }),
      ]);
      if (awaiting > 0) {
        notifications.push({
          id: 'draws-awaiting-approval',
          severity: 'CRITICAL',
          title: 'Draw awaiting your approval',
          detail: 'Sales have closed and the checks passed. The draw runs only after it is approved.',
          count: awaiting,
          href: '/draws/approvals',
        });
      }
      if (held > 0) {
        notifications.push({
          id: 'draws-held',
          severity: 'CRITICAL',
          title: 'Draw held',
          detail: 'A check failed, the draw was rejected, or it changed after approval. It will not run until resolved.',
          count: held,
          href: '/draws/approvals',
        });
      }
      if (setups > 0) {
        notifications.push({
          id: 'draw-setups-pending',
          severity: 'WARNING',
          title: 'Draw setup awaiting approval',
          detail: 'Sales for these draws cannot open until a second admin approves the setup.',
          count: setups,
          href: '/draws/approvals',
        });
      }
    }

    if (isOps) {
      const [pendingAgents, failedToday] = await Promise.all([
        this.prisma.agent.count({ where: { status: AgentStatus.PENDING_KYC } }),
        this.prisma.paymentTransaction.count({
          where: { status: PaymentStatus.FAILED, createdAt: { gte: startOfToday() } },
        }),
      ]);

      if (pendingAgents > 0) {
        notifications.push({
          id: 'agents-pending',
          severity: 'INFO',
          title: 'Agents awaiting activation',
          detail: 'Registered in office, not yet able to sell.',
          count: pendingAgents,
          href: '/agents/onboarding',
        });
      }

      if (failedToday > 0) {
        notifications.push({
          id: 'payments-failed',
          severity: 'WARNING',
          title: 'Failed payments today',
          detail: 'Customers who tried to buy and could not.',
          count: failedToday,
          href: '/tickets',
        });
      }
    }

    if (isCompliance) {
      const [kycPending, expiringSoon, openDisputes] = await Promise.all([
        this.prisma.prizeClaim.count({
          where: { status: PrizeClaimStatus.KYC_PENDING },
        }),
        // Winners about to lose a prize through inaction — the one alert
        // here where a slow response costs a customer real money.
        this.prisma.prizeClaim.count({
          where: {
            status: {
              in: [
                PrizeClaimStatus.NOTIFIED,
                PrizeClaimStatus.SELECTION_MADE,
                PrizeClaimStatus.KYC_PENDING,
              ],
            },
            claimDeadlineAt: { lte: inDays(3), gt: new Date() },
          },
        }),
        this.prisma.dispute.count({
          where: {
            status: {
              in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW, DisputeStatus.ESCALATED],
            },
          },
        }),
      ]);

      if (kycPending > 0) {
        notifications.push({
          id: 'kyc-pending',
          severity: 'WARNING',
          title: 'Claims awaiting KYC review',
          detail: 'Winners cannot be paid until these are reviewed.',
          count: kycPending,
          href: '/claims',
        });
      }

      if (expiringSoon > 0) {
        notifications.push({
          id: 'claims-expiring',
          severity: 'CRITICAL',
          title: 'Claims expiring within 3 days',
          detail: 'These prizes will be forfeited automatically if not completed.',
          count: expiringSoon,
          href: '/claims',
        });
      }

      if (openDisputes > 0) {
        notifications.push({
          id: 'disputes-open',
          severity: 'INFO',
          title: 'Open disputes',
          detail: 'Customer complaints not yet resolved.',
          count: openDisputes,
          href: '/disputes',
        });
      }
    }

    if (isFinance) {
      const [awaitingVerification, late] = await Promise.all([
        this.prisma.remittance.count({
          where: { status: RemittanceStatus.AGENT_CONFIRMED },
        }),
        this.prisma.remittance.count({ where: { status: RemittanceStatus.LATE } }),
      ]);

      if (awaitingVerification > 0) {
        notifications.push({
          id: 'remittance-verify',
          severity: 'WARNING',
          title: 'Legacy transfers awaiting verification',
          detail: 'Historical remittance transfers reported by agents and awaiting finance confirmation.',
          count: awaitingVerification,
          href: '/remittance',
        });
      }

      if (late > 0) {
        notifications.push({
          id: 'remittance-late',
          severity: 'CRITICAL',
          title: 'Legacy remittances past deadline',
          detail: 'Historical remittance obligations remain unsettled. Prepaid selling is unaffected.',
          count: late,
          href: '/remittance',
        });
      }
    }

    const order = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    notifications.sort((a, b) => order[a.severity] - order[b.severity]);

    return {
      notifications,
      total: notifications.reduce((sum, n) => sum + n.count, 0),
      generatedAt: new Date().toISOString(),
    };
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}