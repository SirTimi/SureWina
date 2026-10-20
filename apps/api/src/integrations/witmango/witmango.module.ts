import { Module } from '@nestjs/common';
import { WitmangoClientService } from './witmango-client.service';

@Module({
  providers: [WitmangoClientService],
  exports: [WitmangoClientService],
})
export class WitmangoModule {}
