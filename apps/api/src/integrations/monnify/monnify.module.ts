import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  MonnifyClientService,
} from './monnify-client.service';

@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    MonnifyClientService,
  ],

  exports: [
    MonnifyClientService,
  ],
})
export class MonnifyModule {}