import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IdentityCheck = {
  verified: boolean;
  provider: string;
  devMode: boolean;
  matchedName?: string;
};

// One seam for NIN/BVN verification. Dev mode accepts well-formed values so
// onboarding can be exercised end-to-end; 11.4 swaps in a real provider
// (VerifyMe / Youverify / Dojah) behind this same interface.
@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(private readonly config: ConfigService) {}

  async verifyNin(nin: string, expectedName: string): Promise<IdentityCheck> {
    return this.check('NIN', nin, 11, expectedName);
  }

  async verifyBvn(bvn: string, expectedName: string): Promise<IdentityCheck> {
    return this.check('BVN', bvn, 11, expectedName);
  }

  private async check(
    kind: string,
    value: string,
    expectedLength: number,
    expectedName: string,
  ): Promise<IdentityCheck> {
    const apiKey = this.config.get<string>('IDENTITY_PROVIDER_API_KEY');

    if (!apiKey) {
      const wellFormed = /^\d+$/.test(value) && value.length === expectedLength;
      this.logger.warn(
        `[DEV] ${kind} check for ${value.slice(-4)} → ${wellFormed ? 'accepted' : 'rejected'} (no provider configured)`,
      );
      return {
        verified: wellFormed,
        provider: 'dev-stub',
        devMode: true,
        matchedName: wellFormed ? expectedName : undefined,
      };
    }

    // 11.4: real provider call goes here.
    throw new Error('Identity provider configured but not yet implemented');
  }
}