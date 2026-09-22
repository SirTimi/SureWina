import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { RolloutCheckService } from './rollout-check.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '../../.env.local',
        '../../.env',
        '.env.local',
        '.env',
      ],
    }),
    DatabaseModule,
  ],
  providers: [RolloutCheckService],
  exports: [RolloutCheckService],
})
export class RolloutCheckModule {}
