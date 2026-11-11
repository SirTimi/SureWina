import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  MonnifyClientService,
} from './monnify-client.service';

import {
  MonnifyVerificationService,
} from './monnify-verification.service';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    MonnifyClientService,
    MonnifyVerificationService,
  ],

  exports: [
    MonnifyClientService,
    MonnifyVerificationService,
  ],
})
export class MonnifyModule {}