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

import {
  MonnifyBanksService,
} from './monnify-banks.service';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    MonnifyClientService,
    MonnifyVerificationService,
    MonnifyReservedAccountsService,
    MonnifyBanksService,
  ],

  exports: [
    MonnifyClientService,
    MonnifyVerificationService,
    MonnifyReservedAccountsService,
    MonnifyBanksService,
  ],
})
export class MonnifyModule {}