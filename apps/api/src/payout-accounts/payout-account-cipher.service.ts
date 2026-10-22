
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

@Injectable()
export class PayoutAccountCipherService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const encoded = this.config
      .get<string>('PAYOUT_ACCOUNT_ENCRYPTION_KEY')
      ?.trim() ?? '';

    // Exactly 32 bytes in standard padded Base64.
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new ServiceUnavailableException(
        'Payout account encryption is not configured',
      );
    }

    const key = Buffer.from(encoded, 'base64');

    if (key.length !== 32 || key.toString('base64') !== encoded) {
      throw new ServiceUnavailableException(
        'Invalid payout account encryption configuration',
      );
    }

    return key;
  }

  private context(userId: string, bankCode: string): Buffer {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)
        || !/^\d{3,6}$/.test(bankCode)) {
      throw new BadRequestException('Invalid payout account context');
    }

    return Buffer.from(
      `surewina:payout-account:v1:${userId}:${bankCode}`,
      'utf8',
    );
  }

  encrypt(
    userId: string,
    bankCode: string,
    accountNumber: string,
  ): string {
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new BadRequestException(
        'Bank account number must contain exactly 10 digits',
      );
    }

    const aad = this.context(userId, bankCode);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);

    cipher.setAAD(aad);

    const encrypted = Buffer.concat([
      cipher.update(accountNumber, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(
    userId: string,
    bankCode: string,
    envelope: string,
  ): string {
    const aad = this.context(userId, bankCode);
    const key = this.key();

    try {
      const parts = envelope.split('.');

      if (
        parts.length !== 4 ||
        parts[0] !== 'v1' ||
        !parts.slice(1).every((part) => /^[A-Za-z0-9_-]+$/.test(part))
      ) {
        throw new Error('Invalid envelope');
      }

      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const encrypted = Buffer.from(parts[3], 'base64url');

      if (iv.length !== 12 || tag.length !== 16 || encrypted.length !== 10) {
        throw new Error('Invalid encryption metadata');
      }

      const decipher = createDecipheriv('aes-256-gcm', key, iv);

      decipher.setAAD(aad);
      decipher.setAuthTag(tag);

      const result = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');

      if (!/^\d{10}$/.test(result)) {
        throw new Error('Invalid decrypted account');
      }

      return result;
    } catch {
      // Never expose account details or encryption metadata.
      throw new ConflictException(
        'Payout account encryption validation failed',
      );
    }
  }
}
