import 'reflect-metadata';

import { ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { FinanceAdminController, PrizePayoutProviderDto } from '../src/admin-ops/finance-admin.controller';
import { PrizePayoutEngineService } from '../src/claims/payout/prize-payout-engine.service';
import { getPaystackPrizePayoutReadiness } from '../src/claims/payout/paystack-prize-payout-readiness';

describe('Phase 6B: Finance Paystack prize payout entrypoints', () => {
  const config = (overrides: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      PAYSTACK_TRANSFERS_ENABLED: false,
      PAYSTACK_SECRET_KEY: 'sk_test_fake',
      KYC_BANK_FINGERPRINT_KEY: 'test-fingerprint-key-12345678901234567890',
      ...overrides,
    };
    return { get: jest.fn((key: string) => values[key]) };
  };

  it('accepts only allowed Finance payout rails', () => {
    expect(validateSync(plainToInstance(PrizePayoutProviderDto, {
      provider: 'PAYSTACK',
    }))).toHaveLength(0);
    expect(validateSync(plainToInstance(PrizePayoutProviderDto, {
      provider: 'UNTRUSTED',
    }))).not.toHaveLength(0);
    expect(validateSync(plainToInstance(PrizePayoutProviderDto, {
      provider: 'MONNIFY',
    }))).toHaveLength(0);
  });

  it('has no destination field: global forbidNonWhitelisted rejects arbitrary account numbers', () => {
    const dto = plainToInstance(PrizePayoutProviderDto, {
      provider: 'PAYSTACK',
      accountNumber: '0123456789',
    });
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ property: 'accountNumber' }),
      ]));
  });

  it('does not expose configuration values in its readiness response', () => {
    expect(getPaystackPrizePayoutReadiness(config() as never)).toEqual({
      enabled: false, reason: 'TRANSFERS_DISABLED',
    });
    expect(getPaystackPrizePayoutReadiness(config({
      PAYSTACK_TRANSFERS_ENABLED: true, PAYSTACK_SECRET_KEY: '',
    }) as never)).toEqual({
      enabled: false, reason: 'CONFIGURATION_INCOMPLETE',
    });
    expect(getPaystackPrizePayoutReadiness(config({
      PAYSTACK_TRANSFERS_ENABLED: true,
    }) as never)).toEqual({ enabled: true, reason: null });
  });

  it.each(['initiate', 'retry'] as const)(
    'blocks Paystack %s before creating any database payout when transfers are disabled',
    async (action) => {
      const prisma = { $transaction: jest.fn() };
      const provider = { providerCode: 'PAYSTACK', initiate: jest.fn() };
      const registry = { get: jest.fn().mockReturnValue(provider) };
      const engine = new PrizePayoutEngineService(
        prisma as never, {} as never, {} as never, registry as never,
        {} as never, {} as never, {} as never, config() as never,
      );
      await expect(engine[action]('claim-id', 'finance-admin', 'PAYSTACK'))
        .rejects.toThrow(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(provider.initiate).not.toHaveBeenCalled();
    },
  );

  it('also blocks before reservation when Paystack keys are missing', async () => {
    const prisma = { $transaction: jest.fn() };
    const registry = { get: jest.fn().mockReturnValue({ providerCode: 'PAYSTACK' }) };
    const engine = new PrizePayoutEngineService(
      prisma as never, {} as never, {} as never, registry as never,
      {} as never, {} as never, {} as never,
      config({ PAYSTACK_TRANSFERS_ENABLED: true, PAYSTACK_SECRET_KEY: '' }) as never,
    );
    await expect(engine.initiate('claim-id', 'finance-admin', 'PAYSTACK'))
      .rejects.toThrow(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('routes Finance action requests and safe readiness to the correct service', async () => {
    const engine = {
      initiate: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
      retry: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
      refreshCurrent: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
    };
    const controller = new FinanceAdminController(
      {} as never, {} as never, engine as never,
      config({ PAYSTACK_TRANSFERS_ENABLED: true }) as never,
    );
    expect(controller.payoutRails()).toEqual({
      paystack: { enabled: true, reason: null },
    });
    const dto: PrizePayoutProviderDto = { provider: 'PAYSTACK' };
    const finance = { sub: 'finance-admin' };
    await controller.initiatePayout('claim-id', dto, finance as never);
    await controller.retryPayout('claim-id', dto, finance as never);
    await controller.refreshPayout('claim-id', finance as never);
    expect(engine.initiate).toHaveBeenCalledWith('claim-id', 'finance-admin', 'PAYSTACK');
    expect(engine.retry).toHaveBeenCalledWith('claim-id', 'finance-admin', 'PAYSTACK');
    expect(engine.refreshCurrent).toHaveBeenCalledWith('claim-id', 'finance-admin');
  });
});
