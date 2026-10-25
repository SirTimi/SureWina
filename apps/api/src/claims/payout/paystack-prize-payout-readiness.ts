import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackPrizePayoutReadiness = {
  enabled: boolean;
  reason: 'TRANSFERS_DISABLED' | 'CONFIGURATION_INCOMPLETE' | null;
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

  const secret = config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
  const fingerprintKey = config.get<string>('KYC_BANK_FINGERPRINT_KEY')?.trim();

  if (!secret || !fingerprintKey || fingerprintKey.length < 32) {
    return { enabled: false, reason: 'CONFIGURATION_INCOMPLETE' };
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
