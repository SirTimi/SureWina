import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { RolloutCheckService } from './rollout-check.service';
import { envValidationSchema } from '../config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Use the same Joi coercion and validation as the running API.
      // Without this, a raw string "true" could evade a boolean gate.
      validationSchema: envValidationSchema,
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
