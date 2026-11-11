import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  MonnifyClientService,
} from './monnify-client.service';

import {
  MonnifyVerificationService,
} from './monnify-verification.service';

import {
  MonnifyReservedAccountsService,
} from './monnify-reserved-accounts.service';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    MonnifyClientService,
    MonnifyVerificationService,
    MonnifyReservedAccountsService,
  ],

  exports: [
    MonnifyClientService,
    MonnifyVerificationService,
    MonnifyReservedAccountsService,
  ],
})
export class MonnifyModule {}