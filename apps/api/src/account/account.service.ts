import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType, AuditSeverity, SpendPeriod, User,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BankResolveService } from '../claims/kyc/bank-resolve.service';

const WAT_MS = 60 * 60 * 1000;

function periodStartWat(period: SpendPeriod): Date {
  const wat = new Date(Date.now() + WAT_MS);
  wat.setUTCHours(0, 0, 0, 0);
  if (period === 'WEEKLY') {
    const day = wat.getUTCDay(); // Monday-start week
    wat.setUTCDate(wat.getUTCDate() - ((day + 6) % 7));
  } else if (period === 'MONTHLY') {
    wat.setUTCDate(1);
  }
  return new Date(wat.getTime() - WAT_MS);
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bankResolve: BankResolveService,
  ) {}

  private async getUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { userId } });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  // Single UserMe mapper — /auth/me and every account endpoint speak this.
  toUserMe(u: User) {
    return {
      userId: u.userId,
      phoneNumber: u.phoneNumber,
      email: u.email,
      displayName: u.displayName,
      kycStatus: u.kycStatus,
      loyaltyPointsBalance: u.loyaltyPointsBalance,
      notificationPreferences: {
        sms: u.smsEnabled,
        push: u.pushEnabled,
        email: u.emailEnabled,
      },
      spendLimit:
        u.spendLimitPeriod && u.spendLimitCapNgn
          ? { period: u.spendLimitPeriod, capNgn: u.spendLimitCapNgn }
          : null,
      selfExclusionUntil: u.selfExclusionUntil?.toISOString() ?? null,
      bankAccount: u.bankAccountLast4
        ? {
            bankName: u.bankCode ?? '',
            accountNumber: u.bankAccountLast4,
            accountName: '', // only a hash is stored, by design
          }
        : null,
    };
  }

  async me(userId: string) {
    return this.toUserMe(await this.getUser(userId));
  }

  async updateProfile(userId: string, dto: { displayName?: string | null; email?: string | null }) {
    const user = await this.prisma.user.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: userId },
      action: 'ACCOUNT_PROFILE_UPDATED',
      resource: { type: 'User', id: userId },
      metadata: { fields: Object.keys(dto) },
    });
    return this.toUserMe(user);
  }

  async updateNotifications(userId: string, dto: { sms?: boolean; push?: boolean; email?: boolean }) {
    const user = await this.prisma.user.update({
      where: { userId },
      data: {
        ...(dto.sms !== undefined ? { smsEnabled: dto.sms } : {}),
        ...(dto.push !== undefined ? { pushEnabled: dto.push } : {}),
        ...(dto.email !== undefined ? { emailEnabled: dto.email } : {}),
      },
    });
    return this.toUserMe(user);
  }

  async setSpendLimit(userId: string, period: 'DAILY' | 'WEEKLY' | 'MONTHLY', capNgn: number) {
    const current = await this.getUser(userId);
    // Responsible-play rule: tightening applies instantly; loosening a live
    // limit is refused (prevents in-the-moment override of a past decision).
    if (
      current.spendLimitCapNgn !== null &&
      current.spendLimitPeriod === (period as SpendPeriod) &&
      capNgn > current.spendLimitCapNgn
    ) {
      throw new ConflictException(
        'Limits can be lowered any time; raising one takes effect after contacting support',
      );
    }
    const user = await this.prisma.user.update({
      where: { userId },
      data: { spendLimitPeriod: period as SpendPeriod, spendLimitCapNgn: capNgn },
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: userId },
      action: 'SPEND_LIMIT_SET',
      resource: { type: 'User', id: userId },
      metadata: { period, capNgn },
    });
    return this.toUserMe(user);
  }

  async removeSpendLimit(userId: string) {
    // Same principle: removal is a support action, not one tap.
    throw new ConflictException(
      'Removing a spend limit requires contacting support — this protects the limit you set',
    );
  }

  async takeBreak(userId: string, days: number) {
    if (days > 90) throw new BadRequestException('Breaks can be 1–90 days');
    const until = new Date(Date.now() + days * 86_400_000);
    const user = await this.prisma.user.update({
      where: { userId },
      data: { selfExclusionUntil: until },
    });
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.CUSTOMER, id: userId },
      action: 'RESPONSIBLE_PLAY_BREAK_STARTED',
      resource: { type: 'User', id: userId },
      metadata: { days, until: until.toISOString() },
    });
    return this.toUserMe(user);
  }

  async setBank(userId: string, accountNumber: string, bankCode: string) {
    const resolved = await this.bankResolve.resolve(accountNumber, bankCode);
    const user = await this.prisma.user.update({
      where: { userId },
      data: {
        bankCode,
        bankAccountLast4: accountNumber.slice(-4),
        bankAccountNameHash: createHash('sha256').update(resolved.accountName).digest('hex'),
      },
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: userId },
      action: 'ACCOUNT_BANK_SET',
      resource: { type: 'User', id: userId },
      metadata: { bankCode, last4: accountNumber.slice(-4) },
    });
    return { ...this.toUserMe(user), resolvedAccountName: resolved.accountName };
  }

  // ─── PURCHASE-TIME ENFORCEMENT (C3.2) ───────────────────────
  // Called by every purchase door. Guests (no User row) pass through:
  // limits and breaks are account features. Throws 409 on violation.
  async assertPurchaseAllowed(phoneNumber: string, amountNgn: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
      select: {
        userId: true,
        selfExclusionUntil: true,
        spendLimitPeriod: true,
        spendLimitCapNgn: true,
      },
    });
    if (!user) return;

    if (user.selfExclusionUntil && user.selfExclusionUntil.getTime() > Date.now()) {
      throw new ConflictException(
        'Purchases are paused on this account until ' +
          user.selfExclusionUntil.toISOString().slice(0, 10),
      );
    }

    if (user.spendLimitPeriod && user.spendLimitCapNgn) {
      const since = periodStartWat(user.spendLimitPeriod);
      const spent = await this.prisma.paymentTransaction.aggregate({
        where: {
          buyerPhone: phoneNumber,
          status: 'CONFIRMED',
          confirmedAt: { gte: since },
        },
        _sum: { amountNgn: true },
      });
      const already = spent._sum.amountNgn ?? 0;
      if (already + amountNgn > user.spendLimitCapNgn) {
        const remaining = Math.max(0, user.spendLimitCapNgn - already);
        throw new ConflictException(
          `This purchase would exceed your ${user.spendLimitPeriod.toLowerCase()} spend limit — ` +
            `₦${remaining.toLocaleString('en-NG')} remaining of ₦${user.spendLimitCapNgn.toLocaleString('en-NG')}`,
        );
      }
    }
  }

  
}