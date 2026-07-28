import { Injectable } from '@nestjs/common';
import {
  AdminRole,
  AdminTier,
  AgentStatus,
  ConfigVersionStatus,
  DisputeStatus,
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
          href: '/draws/schedule',
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
          title: 'Transfers awaiting your verification',
          detail: 'Agents say the money is sent; commission is held until you confirm.',
          count: awaitingVerification,
          href: '/remittance',
        });
      }

      if (late > 0) {
        notifications.push({
          id: 'remittance-late',
          severity: 'CRITICAL',
          title: 'Late remittances',
          detail: 'Agents holding company cash past their deadline.',
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