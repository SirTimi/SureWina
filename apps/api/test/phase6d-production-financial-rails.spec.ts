import { RolloutCheckService } from '../src/rollout/rollout-check.service';

describe('Phase 6D: production financial rail rollout gates', () => {
  const baseline: Record<string, unknown> = {
    NODE_ENV: 'production',
    PAYSTACK_SECRET_KEY: 'sk_live_fixture_not_a_real_key',
    PAYSTACK_BASE_URL: 'https://api.paystack.co',
    KYC_BANK_FINGERPRINT_KEY: 'ci-only-fingerprint-key-12345678901234567',
    PAYOUT_ACCOUNT_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    PAYSTACK_TRANSFERS_ENABLED: false,
    MONNIFY_API_KEY: 'ci-only',
    MONNIFY_SECRET_KEY: 'ci-only',
    MONNIFY_CONTRACT_CODE: 'ci-only',
    MONNIFY_SOURCE_ACCOUNT_NUMBER: 'ci-only',
    MONNIFY_BASE_URL: 'https://api.monnify.com',
    MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS: false,
    FLUTTERWAVE_SECRET_KEY: 'ci-only',
    FLUTTERWAVE_WEBHOOK_HASH: 'ci-only',
    FLUTTERWAVE_BASE_URL: 'https://api.flutterwave.com',
    PAYMENT_CALLBACK_BASE_URL: 'https://surewina.example',
    PUBLIC_WEB_BASE_URL: 'https://surewina.example',
    AGENT_WEB_BASE_URL: 'https://agents.surewina.example',
    TREASURY_BANK_REFERENCE: 'ci-only',
    TREASURY_BANK_CODE: '058',
    TREASURY_BANK_ACCOUNT_LAST4: '6789',
    FINANCIAL_LEDGER_CUTOVER_AT: '2026-09-20T00:00:00Z',
    REFUNDS_MODE: 'live',
    WITMANGO_ENABLED: false,
    WITMANGO_MONETARY_ENABLED: false,
    WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED: false,
    WITMANGO_PROVISIONING_ENABLED: false,
  };

  const setup = (override: Record<string, unknown> = {}) => {
    const values = { ...baseline, ...override };
    const config = { get: jest.fn((key: string) => values[key]) };
    const service = new RolloutCheckService({} as never, config as never);
    // A private method is used here because the full rollout reads real ledgers.
    const check = () => service['checkProductionConfiguration']();
    return { service, check, config };
  };

  const details = (result: ReturnType<ReturnType<typeof setup>['check']> extends Promise<infer R> ? () => R : ReturnType<typeof setup>['check']) =>
    JSON.stringify(result.details ?? []);

  it('preserves Monnify and Flutterwave collection and payout requirements', () => {
    expect(setup().check().status).toBe('PASS');
    const result = setup({
      MONNIFY_SOURCE_ACCOUNT_NUMBER: '',
      FLUTTERWAVE_WEBHOOK_HASH: '',
      PAYSTACK_TRANSFERS_ENABLED: false,
    }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('MONNIFY_SOURCE_ACCOUNT_NUMBER');
    expect(details(result)).toContain('FLUTTERWAVE_WEBHOOK_HASH');
  });

  it.each(['true', true, 'TrUe'])(
    'blocks WITMANGO_MONETARY_ENABLED=%s despite raw string configuration',
    (value) => {
      const result = setup({ WITMANGO_MONETARY_ENABLED: value }).check();
      expect(result.status).toBe('BLOCKER');
      expect(details(result)).toContain('WITMANGO_MONETARY_ENABLED');
    },
  );

  it('blocks withdrawal reservations independently of the CBA debit flag', () => {
    const result = setup({
      WITMANGO_ENABLED: false,
      WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED: 'true',
    }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED');
  });

  it('does not interpret enabled Paystack transfers as Finance-approved settlement', () => {
    const result = setup({ PAYSTACK_TRANSFERS_ENABLED: 'true' }).check();
    expect(result.status).toBe('REVIEW');
    expect(result.summary).toContain('Finance sign-off');
  });

  it('rejects Paystack sandbox keys even when transfer initiation is disabled', () => {
    const result = setup({ PAYSTACK_SECRET_KEY: 'sk_test_ci_only' }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('PAYSTACK_SECRET_KEY');
    expect(details(result)).not.toContain('sk_test_ci_only');
  });

  it('rejects payment provider endpoint misconfiguration', () => {
    const result = setup({
      PAYSTACK_BASE_URL: 'https://api.paystack.co.attacker.invalid',
      MONNIFY_BASE_URL: 'https://sandbox.monnify.com',
      FLUTTERWAVE_BASE_URL: 'http://localhost:7777',
    }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('PAYSTACK_BASE_URL');
    expect(details(result)).toContain('MONNIFY_BASE_URL');
    expect(details(result)).toContain('FLUTTERWAVE_BASE_URL');
  });

  it('requires real locked-beneficiary cryptographic configuration for the legacy payout rails', () => {
    const result = setup({
      KYC_BANK_FINGERPRINT_KEY: 'short',
      PAYOUT_ACCOUNT_ENCRYPTION_KEY: '',
      PAYSTACK_TRANSFERS_ENABLED: false,
    }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('KYC_BANK_FINGERPRINT_KEY');
    expect(details(result)).toContain('PAYOUT_ACCOUNT_ENCRYPTION_KEY');
  });

  it('permits a configured HTTPS read-only Witmango connector, but not a broken tenant', () => {
    const configured = {
      WITMANGO_ENABLED: true,
      WITMANGO_BASE_URL: 'https://cba.surewina.example/fineract-provider/api',
      WITMANGO_TENANT_ID: 'ci',
      WITMANGO_USERNAME: 'ci-only',
      WITMANGO_PASSWORD: 'ci-only',
    };
    expect(setup(configured).check().status).toBe('PASS');
    const result = setup({ ...configured, WITMANGO_TENANT_ID: '' }).check();
    expect(result.status).toBe('BLOCKER');
    expect(details(result)).toContain('WITMANGO_ENABLED');
  });

  it('requires signed Monnify webhooks and an explicitly reviewed refund mode', () => {
    const bad = setup({ MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS: 'true' }).check();
    expect(bad.status).toBe('BLOCKER');
    const review = setup({ REFUNDS_MODE: 'dev' }).check();
    expect(review.status).toBe('REVIEW');
  });

  it('automatically enforces strict reviews in --production mode', async () => {
    const { service } = setup();
    const checks = [
      'checkSystemLedgerAccounts', 'checkLedgerBalance', 'checkWalletStructure',
      'checkWalletBalances', 'checkLocalSmokeArtifacts', 'checkPaymentCollections',
      'checkWalletFunding', 'checkWalletPurchases', 'checkPromotionalJackpotPurchases',
      'checkAgentSales', 'checkAgentPrizeReimbursements', 'checkBankPrizePayouts',
      'checkCbaWithdrawalHolds', 'checkRetiredDebtSuspensions', 'checkReconciliation',
      'checkSuspenseBalance', 'checkTreasury', 'checkMigration', 'checkHistoricalRemittance',
    ];
    for (const name of checks) {
      Reflect.set(service, name, jest.fn().mockResolvedValue({
        id: name, label: name, status: 'PASS', summary: 'mocked for production readiness test',
      }));
    }
    Reflect.set(service, 'checkProductionConfiguration', jest.fn().mockReturnValue({
      id: 'config.production',
      label: 'Production financial configuration',
      status: 'REVIEW',
      summary: 'External financial evidence pending',
    }));

    const result = await service.run({ production: true, strictReview: false });
    expect(result.summary.blockers).toBe(0);
    expect(result.summary.reviews).toBe(1);
    expect(result.strictReview).toBe(true);
    expect(result.ready).toBe(false);

    const nonproduction = await service.run({ production: false, strictReview: false });
    expect(nonproduction.strictReview).toBe(false);
    expect(nonproduction.ready).toBe(true);
  });
});
