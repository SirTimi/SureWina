import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackPrizePayoutReadiness = {
  enabled: boolean;
  reason: 'TRANSFERS_DISABLED' | 'CONFIGURATION_INCOMPLETE' |
    'PRODUCTION_ACCEPTANCE_PENDING' | 'SANDBOX_KEY_REQUIRED' | null;
};

/**
 * This is not approval for a live payout or proof of funds.
 * Locked-beneficiary authorization and bank balance checks run separately.
 */
export function getPaystackPrizePayoutReadiness(
  config: ConfigService,
): PaystackPrizePayoutReadiness {
  if (config.get<boolean>('PAYSTACK_TRANSFERS_ENABLED') !== true) {
    return { enabled: false, reason: 'TRANSFERS_DISABLED' };
  }

  // A configuration toggle must never substitute for third-party acceptance
  // and Finance-controlled release. This production lock is intentionally
  // fixed in source and cannot be switched off by environment variables.
  if (config.get<string>('NODE_ENV') === 'production') {
    return { enabled: false, reason: 'PRODUCTION_ACCEPTANCE_PENDING' };
  }

  const secret = config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
  const fingerprintKey = config.get<string>('KYC_BANK_FINGERPRINT_KEY')?.trim();

  if (!secret || !fingerprintKey || fingerprintKey.length < 32) {
    return { enabled: false, reason: 'CONFIGURATION_INCOMPLETE' };
  }

  // Until release is approved, only an actual Paystack sandbox key
  // may initiate a test payout from non-production environments.
  if (!secret.startsWith('sk_test_')) {
    return { enabled: false, reason: 'SANDBOX_KEY_REQUIRED' };
  }

  return { enabled: true, reason: null };
}

export function requirePaystackPrizePayoutReadiness(
  config: ConfigService,
): void {
  if (!getPaystackPrizePayoutReadiness(config).enabled) {
    throw new ServiceUnavailableException(
      'Paystack prize payouts are not enabled and configured',
    );
  }
}
