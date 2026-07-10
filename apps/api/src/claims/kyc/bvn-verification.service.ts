import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type BvnCheckResult = {
  verified: boolean;
  devMode: boolean;
};

// BVN identity check. DEV MODE: no provider key configured → logs and
// auto-verifies so local dev is testable. Production swaps this for a real
// provider (VerifyMe / Smile Identity) behind the same method.
@Injectable()
export class BvnVerificationService {
  private readonly logger = new Logger(BvnVerificationService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(bvn: string, phoneNumber: string): Promise<BvnCheckResult> {
    const apiKey = this.config.get<string>('BVN_PROVIDER_API_KEY');

    if (!apiKey) {
      this.logger.log(
        `[DEV BVN] auto-verifying BVN ending ${bvn.slice(-4)} for ${phoneNumber}`,
      );
      return { verified: true, devMode: true };
    }

    // Real provider integration goes here when a key exists.
    throw new ServiceUnavailableException(
      'BVN provider configured but integration not implemented',
    );
  }
}