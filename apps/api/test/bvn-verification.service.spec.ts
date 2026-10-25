import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { BvnVerificationService } from '../src/claims/kyc/bvn-verification.service';

describe('Phase 6: legacy BVN verification must fail closed', () => {
  const service = new BvnVerificationService();

  it('rejects an invalid BVN', async () => {
    await expect(service.verify('123', '+2348012345678'))
      .rejects.toThrow(BadRequestException);
  });

  it('does not approve a syntactically valid BVN without real provider evidence', async () => {
    await expect(service.verify('12345678901', '+2348012345678'))
      .rejects.toThrow(ServiceUnavailableException);
  });
});
