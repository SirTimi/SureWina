import { LedgerAccountPurpose, LedgerAccountType, LedgerOwnerType } from '@prisma/client';

import { SYSTEM_LEDGER_ACCOUNTS, SYSTEM_LEDGER_ACCOUNT_CODES } from '../src/ledger/ledger.constants';
import { LedgerBootstrapService } from '../src/ledger/ledger-bootstrap.service';

describe('LedgerBootstrapService', () => {
  it('ensures all defined system accounts, including Paystack payout clearing', async () => {
    const ledger = { ensureAccount: jest.fn().mockResolvedValue({}) };
    const service = new LedgerBootstrapService(ledger as never);

    await service.onModuleInit();

    expect(ledger.ensureAccount).toHaveBeenCalledTimes(SYSTEM_LEDGER_ACCOUNTS.length);
    expect(ledger.ensureAccount).toHaveBeenCalledWith({
      code: SYSTEM_LEDGER_ACCOUNT_CODES.PAYSTACK_PAYOUT_CLEARING,
      name: 'Paystack Payout Clearing',
      accountType: LedgerAccountType.ASSET,
      purpose: LedgerAccountPurpose.PAYOUT_CLEARING,
      ownerType: LedgerOwnerType.SYSTEM,
      ownerId: null,
      currency: 'NGN',
    });
  });

  it('does not hide a ledger identity mismatch', async () => {
    const ledger = {
      ensureAccount: jest.fn().mockRejectedValue(new Error('Account identity mismatch')),
    };
    const service = new LedgerBootstrapService(ledger as never);

    await expect(service.onModuleInit()).rejects.toThrow('Account identity mismatch');
  });
});
