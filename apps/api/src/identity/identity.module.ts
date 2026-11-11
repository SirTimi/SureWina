import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MonnifyModule } from '../integrations/monnify/monnify.module';

import { IdentityController } from './identity.controller';
import { IdentityVerificationService } from './identity-verification.service';

@Module({
  imports: [JwtModule.register({}), MonnifyModule],
  controllers: [IdentityController],
  providers: [IdentityVerificationService],
  exports: [IdentityVerificationService],
})
export class IdentityModule {}