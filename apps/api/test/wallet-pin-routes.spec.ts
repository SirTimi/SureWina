import { ForbiddenException } from '@nestjs/common';

import { CustomerWithdrawalsController } from '../src/withdrawals/customer-withdrawals.controller';
import { AgentWithdrawalsController } from '../src/withdrawals/agent-withdrawals.controller';

function deps(pinOk: boolean) {
  const calls: string[] = [];
  const wallets = {
    getCustomerWallet: jest.fn(async () => ({ walletId: 'w-c' })),
    ensureAgentWallet: jest.fn(async () => ({ walletId: 'w-a' })),
  };
  const accounts = { add: jest.fn(async (_o: unknown, input: unknown) => { calls.push('add'); return input; }) };
  const withdrawals = { request: jest.fn(async (_o: unknown, input: unknown) => { calls.push('request'); return input; }) };
  const pins = {
    verifyIfRequired: jest.fn(async () => {
      calls.push('pin');
      if (!pinOk) throw new ForbiddenException('Incorrect PIN');
    }),
  };
  return { wallets, accounts, withdrawals, pins, calls };
}

const account = { bankCode: '058', accountNumber: '0123456789', bvn: '22222222222', pin: '4826' };
const withdrawal = { withdrawalAccountId: '7d3c3d7e-6a8b-4c3e-9f5d-2a1b0c9d8e7f', amountNgn: 5000, requestId: 'req-12345678', pin: '4826' };

describe('Withdrawal routes check the PIN first and never pass it on', () => {
  for (const kind of ['customer', 'agent'] as const) {
    it(`${kind}: PIN checked before saving an account or withdrawing`, async () => {
      const d = deps(true);
      const controller =
        kind === 'customer'
          ? new CustomerWithdrawalsController(d.wallets as never, d.accounts as never, d.withdrawals as never, {} as never, d.pins as never)
          : new AgentWithdrawalsController(d.wallets as never, d.accounts as never, d.withdrawals as never, {} as never, d.pins as never);
      const who = { sub: 'id-1' } as never;

      const saved = await controller.addAccount(who, account);
      const made = await controller.request(who, withdrawal);

      expect(d.calls).toEqual(['pin', 'add', 'pin', 'request']);
      expect(saved).not.toHaveProperty('pin');
      expect(made).not.toHaveProperty('pin');
      expect(d.pins.verifyIfRequired).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'id-1' }), '4826');
    });

    it(`${kind}: a wrong PIN stops everything`, async () => {
      const d = deps(false);
      const controller =
        kind === 'customer'
          ? new CustomerWithdrawalsController(d.wallets as never, d.accounts as never, d.withdrawals as never, {} as never, d.pins as never)
          : new AgentWithdrawalsController(d.wallets as never, d.accounts as never, d.withdrawals as never, {} as never, d.pins as never);
      const who = { sub: 'id-1' } as never;

      await expect(controller.addAccount(who, account)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.request(who, withdrawal)).rejects.toBeInstanceOf(ForbiddenException);
      expect(d.accounts.add).not.toHaveBeenCalled();
      expect(d.withdrawals.request).not.toHaveBeenCalled();
    });
  }
});
