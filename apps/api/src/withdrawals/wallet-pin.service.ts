import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

import { AuditSeverity, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletOwner, WithdrawalAccountService } from './withdrawal-account.service';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 60 * 1000;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

export type WalletPinStatus = {
  set: boolean;
  lockedUntil: string | null;
};

// The PIN a customer or agent enters to withdraw or to save a bank account.
//
// Four digits, never stored: only a salted scrypt hash. Five wrong tries in
// a row lock it for 30 minutes. A forgotten PIN is reset with the owner's
// BVN, checked against the one the wallet was verified with; a wrong BVN
// counts as a wrong try.
@Injectable()
export class WalletPinService {
  private readonly logger = new Logger(WalletPinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly accounts: WithdrawalAccountService,
  ) {}

  isRequired(): boolean {
    return this.config.get<boolean>('WALLET_PIN_REQUIRED') !== false;
  }

  async status(owner: WalletOwner): Promise<WalletPinStatus> {
    const row = await this.prisma.walletPin.findUnique({
      where: { walletId: owner.walletId },
    });

    return {
      set: Boolean(row),
      lockedUntil:
        row?.lockedUntil && row.lockedUntil > new Date()
          ? row.lockedUntil.toISOString()
          : null,
    };
  }

  // First PIN only. Changing one needs the current PIN; a forgotten one
  // needs the BVN.
  async set(owner: WalletOwner, pin: string): Promise<WalletPinStatus> {
    this.requireAcceptable(pin);

    const now = new Date();

    try {
      await this.prisma.walletPin.create({
        data: {
          walletId: owner.walletId,
          pinHash: await this.hash(pin),
          setAt: now,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A withdrawal PIN is already set. Change it instead.');
      }

      throw error;
    }

    await this.writeAudit(owner, 'WALLET_PIN_SET', AuditSeverity.WARNING);

    return this.status(owner);
  }

  async change(owner: WalletOwner, currentPin: string, newPin: string): Promise<WalletPinStatus> {
    this.requireAcceptable(newPin);

    await this.verify(owner, currentPin);

    await this.prisma.walletPin.update({
      where: { walletId: owner.walletId },
      data: { pinHash: await this.hash(newPin), setAt: new Date() },
    });

    await this.writeAudit(owner, 'WALLET_PIN_CHANGED', AuditSeverity.WARNING);

    return this.status(owner);
  }

  async reset(owner: WalletOwner, bvn: string, newPin: string): Promise<WalletPinStatus> {
    if (!/^\d{11}$/.test(bvn ?? '')) {
      throw new BadRequestException('A BVN must be exactly 11 digits');
    }

    this.requireAcceptable(newPin);

    const row = await this.prisma.walletPin.findUnique({
      where: { walletId: owner.walletId },
    });

    if (!row) {
      throw new ConflictException('No withdrawal PIN is set yet');
    }

    this.requireNotLocked(row.lockedUntil);

    if (!(await this.accounts.isOwnersBvn(owner, bvn))) {
      await this.recordFailure(owner, 'WALLET_PIN_RESET_BVN_MISMATCH');

      throw new ForbiddenException('That BVN does not match this wallet');
    }

    await this.prisma.walletPin.update({
      where: { walletId: owner.walletId },
      data: {
        pinHash: await this.hash(newPin),
        setAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.writeAudit(owner, 'WALLET_PIN_RESET', AuditSeverity.CRITICAL);

    return this.status(owner);
  }

  // Throws unless the PIN is right. Used before every withdrawal and before
  // a bank account is saved.
  async verify(owner: WalletOwner, pin: string | undefined): Promise<void> {
    const row = await this.prisma.walletPin.findUnique({
      where: { walletId: owner.walletId },
    });

    if (!row) {
      throw new ConflictException('Set a withdrawal PIN first');
    }

    this.requireNotLocked(row.lockedUntil);

    if (!/^\d{4}$/.test(pin ?? '') || !(await this.matches(pin as string, row.pinHash))) {
      const left = await this.recordFailure(owner, 'WALLET_PIN_WRONG');

      throw new ForbiddenException(
        left > 0
          ? `Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'Incorrect PIN. Your PIN is locked for 30 minutes.',
      );
    }

    if (row.failedAttempts > 0) {
      await this.prisma.walletPin.update({
        where: { walletId: owner.walletId },
        data: { failedAttempts: 0 },
      });
    }
  }

  // For the withdrawal and bank-account routes: checks the PIN when PINs
  // are required.
  async verifyIfRequired(owner: WalletOwner, pin: string | undefined): Promise<void> {
    if (this.isRequired()) {
      await this.verify(owner, pin);
    }
  }

  // Returns how many tries are left before the lock.
  private async recordFailure(owner: WalletOwner, action: string): Promise<number> {
    const updated = await this.prisma.walletPin.update({
      where: { walletId: owner.walletId },
      data: { failedAttempts: { increment: 1 } },
    });

    if (updated.failedAttempts >= MAX_ATTEMPTS) {
      await this.prisma.walletPin.update({
        where: { walletId: owner.walletId },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
      });

      await this.writeAudit(owner, 'WALLET_PIN_LOCKED', AuditSeverity.CRITICAL);

      return 0;
    }

    await this.writeAudit(owner, action, AuditSeverity.WARNING);

    return MAX_ATTEMPTS - updated.failedAttempts;
  }

  private requireNotLocked(lockedUntil: Date | null): void {
    if (lockedUntil && lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));

      throw new ForbiddenException(
        `Your PIN is locked after too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }
  }

  // Four digits, not all the same and not a straight run (1234, 9876).
  private requireAcceptable(pin: string): void {
    if (!/^\d{4}$/.test(pin ?? '')) {
      throw new BadRequestException('A PIN must be exactly 4 digits');
    }

    const digits = [...pin].map(Number);
    const steps = digits.slice(1).map((d, i) => d - digits[i]);

    if (steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1)) {
      throw new BadRequestException('Choose a PIN that is harder to guess');
    }
  }

  private async hash(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await this.derive(pin, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);

    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  private async matches(pin: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');

    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      this.logger.error('A stored wallet PIN hash is malformed');
      return false;
    }

    const [, n, r, p, saltHex, keyHex] = parts;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await this.derive(pin, Buffer.from(saltHex, 'hex'), Number(n), Number(r), Number(p));

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private derive(pin: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(pin, salt, KEY_LENGTH, { N, r, p }, (error, key) =>
        error ? reject(error) : resolve(key),
      );
    });
  }

  private async writeAudit(owner: WalletOwner, action: string, severity: AuditSeverity) {
    await this.audit
      .write({
        severity,
        actor: owner.actor,
        action,
        resource: { type: 'Wallet', id: owner.walletId },
        metadata: { ownerType: owner.ownerType },
      })
      .catch(() => undefined);
  }
}
