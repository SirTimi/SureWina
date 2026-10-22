
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PayoutAccountCipherService } from
  '../src/payout-accounts/payout-account-cipher.service';

describe('PayoutAccountCipherService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const bankCode = '058';
  const accountNumber = '0123456789';

  function createService(key?: string) {
    const config = {
      get: (name: string) =>
        name === 'PAYOUT_ACCOUNT_ENCRYPTION_KEY'
          ? key
          : undefined,
    };

    return new PayoutAccountCipherService(
      config as ConfigService,
    );
  }

  const testKey = Buffer.alloc(32, 17).toString('base64');

  it('encrypts and decrypts a valid NUBAN', () => {
    const service = createService(testKey);

    const encrypted = service.encrypt(
      userId,
      bankCode,
      accountNumber,
    );

    expect(encrypted).not.toContain(accountNumber);
    expect(encrypted.startsWith('v1.')).toBe(true);

    expect(
      service.decrypt(userId, bankCode, encrypted),
    ).toBe(accountNumber);
  });

  it('generates different ciphertexts for repeated encryption', () => {
    const service = createService(testKey);

    const first = service.encrypt(userId, bankCode, accountNumber);
    const second = service.encrypt(userId, bankCode, accountNumber);

    expect(first).not.toBe(second);
  });

  it('rejects ciphertext copied to another user', () => {
    const service = createService(testKey);
    const encrypted = service.encrypt(userId, bankCode, accountNumber);

    expect(() =>
      service.decrypt(otherUserId, bankCode, encrypted),
    ).toThrow(ConflictException);
  });

  it('rejects ciphertext copied to another bank', () => {
    const service = createService(testKey);
    const encrypted = service.encrypt(userId, bankCode, accountNumber);

    expect(() =>
      service.decrypt(userId, '044', encrypted),
    ).toThrow(ConflictException);
  });

  it('rejects tampered ciphertext', () => {
    const service = createService(testKey);
    const encrypted = service.encrypt(userId, bankCode, accountNumber);
    const parts = encrypted.split('.');

    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);

    expect(() =>
      service.decrypt(userId, bankCode, parts.join('.')),
    ).toThrow(ConflictException);
  });

  it('rejects invalid bank account numbers', () => {
    const service = createService(testKey);

    expect(() =>
      service.encrypt(userId, bankCode, '12345'),
    ).toThrow(BadRequestException);
  });

  it('fails closed without an encryption key', () => {
    const service = createService();

    expect(() =>
      service.encrypt(userId, bankCode, accountNumber),
    ).toThrow(ServiceUnavailableException);
  });
});
