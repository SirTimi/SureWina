
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class BvnVerificationService {
  /**
   * Legacy synchronous verification is disabled.
   *
   * Paystack customer identification is asynchronous.
   * An accepted request must never be treated as VERIFIED.
   */
  async verify(
    bvn: string,
    _phoneNumber: string,
  ): Promise<never> {
    if (!/^\d{11}$/.test(bvn)) {
      throw new BadRequestException(
        'BVN must be exactly 11 digits',
      );
    }

    throw new ServiceUnavailableException(
      'Use Paystack identity verification to complete KYC',
    );
  }
}
