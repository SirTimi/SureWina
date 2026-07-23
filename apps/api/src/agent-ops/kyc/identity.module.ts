import { Global, Module } from '@nestjs/common';
import { IdentityVerificationService } from './identity-verification.service';

@Global()
@Module({
  providers: [IdentityVerificationService],
  exports: [IdentityVerificationService],
})
export class IdentityModule {}